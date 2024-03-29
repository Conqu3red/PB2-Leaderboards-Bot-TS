import { RemoteResource } from "./RemoteResource";
import { weeklyIndex } from "./WeeklyIndex";
import { WeeklyLevel } from "./WeeklyLevel";
import { loadCampaignLevelInfos } from "./CampaignIndex";
import { CampaignLevel } from "./CampaignLevel";
import { LevelCode, levelCodeEqual, parseLevelCode } from "../LevelCode";
import { campaignBuckets } from "./Buckets";
import { asyncSetTimeout } from "../utils/asyncTimeout";

export async function bulkMaybeReload(resources: RemoteResource<any>[]) {
    return Promise.all(
        resources.map(async (resource) => {
            if (await resource.needsReload()) await resource.reload();
        })
    );
}

export class CampaignManager {
    static CAMPAIGN_LEVEL_RELOAD_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours
    campaignLevels: CampaignLevel[] = [];

    async populate() {
        let levelInfos = await loadCampaignLevelInfos();
        this.campaignLevels = levelInfos.map(
            (info) => new CampaignLevel(info, CampaignManager.CAMPAIGN_LEVEL_RELOAD_INTERVAL)
        );
    }

    async maybeReload() {
        let reloadRequired = this.campaignLevels.some((level) => level.needsReload());

        if (this.campaignLevels.length === 0) {
            await this.populate();
            reloadRequired = true;
        }

        await bulkMaybeReload(this.campaignLevels);
    }

    async timeToNextReload(): Promise<number> {
        return Math.min(
            ...(await Promise.all(this.campaignLevels.map((level) => level.timeUntilNextReload())))
        );
    }

    async getByCode(code: LevelCode | string): Promise<CampaignLevel | null> {
        await this.maybeReload();
        let actualCode: LevelCode;
        if (typeof code === "string") {
            let newCode = parseLevelCode(code);
            if (newCode === null) return null;
            actualCode = newCode;
        } else {
            actualCode = code;
        }

        let level = this.campaignLevels.find((level) =>
            levelCodeEqual(level.info.code, actualCode)
        );
        return level ?? null;
    }
}

export class WeeklyManager {
    static WEEKLY_RELOAD_INTERVAL = 60 * 60 * 1000; // 1 hour
    static INACTIVE_WEEKLY_RELOAD_INTERVAL = WeeklyManager.WEEKLY_RELOAD_INTERVAL * 16;
    weeklyLevels: WeeklyLevel[] = [];

    async populate() {
        if (await weeklyIndex.needsReload()) {
            await weeklyIndex.reload();
        }
        let levelInfos = await weeklyIndex.get();
        levelInfos.sort((a, b) => a.week - b.week);

        // fast reload the latest two weekly levels, others don't update as much
        this.weeklyLevels = levelInfos.map(
            (info) => new WeeklyLevel(info, WeeklyManager.INACTIVE_WEEKLY_RELOAD_INTERVAL)
        );
        for (let i = 1; i <= 2; i++) {
            let current = this.weeklyLevels.at(-i);
            if (current) current.reloadIntervalMs = WeeklyManager.WEEKLY_RELOAD_INTERVAL;
        }
    }

    async maybeReload() {
        let reloadRequired =
            this.weeklyLevels.length == 0 || this.weeklyLevels.some((level) => level.needsReload());
        if (reloadRequired) await this.populate();
        await bulkMaybeReload(this.weeklyLevels);
    }

    async timeToNextReload(): Promise<number> {
        return Math.min(
            ...(await Promise.all(this.weeklyLevels.map((level) => level.timeUntilNextReload())))
        );
    }

    async getLatest(): Promise<WeeklyLevel | null> {
        await this.maybeReload();
        let week = Math.max(...this.weeklyLevels.map((level) => level.info.week));
        return this.getByWeek(week);
    }

    async getByWeek(week: number): Promise<WeeklyLevel | null> {
        await this.maybeReload();
        let level = this.weeklyLevels.find((level) => level.info.week === week);
        return level ?? null;
    }
}

export class CacheManager {
    campaignManager = new CampaignManager();
    weeklyManager = new WeeklyManager();
    // TODO: attach manager for bin collated file?

    async maybeReload() {
        await this.campaignManager.maybeReload();
        await this.weeklyManager.maybeReload();
        if (await campaignBuckets.needsReload()) await campaignBuckets.reload();
    }

    async backgroundUpdate() {
        await this.campaignManager.populate();
        await this.weeklyManager.populate();

        while (true) {
            let nextReloadTime = Math.min(
                await this.campaignManager.timeToNextReload(),
                await this.weeklyManager.timeToNextReload(),
                await campaignBuckets.timeUntilNextReload()
            );

            console.log(`[CacheManager] Next reload in ${nextReloadTime / 1000}s`);
            await asyncSetTimeout(nextReloadTime);

            await this.maybeReload();
        }
    }
}

export const cacheManager = new CacheManager();
