import { LeaderboardType } from "../../../LeaderboardInterface";
import { ExtendedClient } from "../../structures/Client";
import { Command } from "../../structures/Command";
import { v4 as uuidv4 } from "uuid";
import { arrowComponents, EditMessageType, PagedResponder } from "../../structures/PagedResponder";
import { error } from "../../utils/embeds";
import { N_ENTRIES as ENTRIES_PER_PAGE } from "../../../Consts";
import {
    GlobalEntry,
    globalLeaderboard,
    GlobalOptions,
    LevelCategory,
    renderGlobal,
} from "../../../GlobalLeaderboard";
import { AttachmentBuilder, CommandInteraction, SlashCommandBuilder } from "discord.js";
import { matchesUserFilter, UserFilter } from "../../../utils/userFilter";
import { pickUserFilter, pickUserFilterError } from "../../utils/pickUserFilter";
import {
    formatManyWorldFilters,
    parseManyWorldFilters,
    parseWorldFilter,
    WorldFilter,
} from "../../../utils/WorldFilter";

interface LeaderboardOptions {
    globalOptions: GlobalOptions;
    unbroken: boolean;
    userFilter: UserFilter | null;
    score: number | null;
    rank: number | null;
}

function getBoardIndex(board: GlobalEntry[], options: LeaderboardOptions) {
    for (let i = 0; i < board.length; i++) {
        const entry = board[i];

        if (options.rank && entry.rank === options.rank) return i;
        if (options.score && entry.value === options.score) return i;
        if (options.userFilter && matchesUserFilter(options.userFilter, entry.user)) return i;
    }

    return 0;
}

interface Data {
    board: GlobalEntry[];
    options: LeaderboardOptions;
}

class PagedGlobalLeaderboard extends PagedResponder {
    data: Data;
    constructor(client: ExtendedClient, interaction: CommandInteraction, data: Data) {
        let pageCount = Math.ceil(data.board.length / ENTRIES_PER_PAGE);
        super(client, interaction, pageCount);
        this.data = data;
        this.page = Math.floor(
            getBoardIndex(this.data.board, this.data.options) / ENTRIES_PER_PAGE
        );
    }

    getDetails() {
        let details: string[] = [];
        details.push(`${this.data.options.globalOptions.levelCategory} levels`);
        const worldFilters = this.data.options.globalOptions.worldFilters;
        if (worldFilters && worldFilters.length > 0) {
            const worlds = formatManyWorldFilters(worldFilters);
            details.push(`World ${worlds}`);
        }
        if (this.data.options.unbroken) details.push("unbroken");
        return details.length === 0 ? "" : `(${details.join(", ")})`;
    }

    async generateMessage(): Promise<EditMessageType> {
        let board = await renderGlobal(
            this.data.board,
            this.page * ENTRIES_PER_PAGE,
            this.data.options.globalOptions
        );
        let uuid = uuidv4();
        let attachment = new AttachmentBuilder(board).setName(`${uuid}.png`);

        return {
            content: "",
            embeds: [
                {
                    title: `Global Leaderboard ${this.getDetails()}`,
                    color: 0x3586ff,
                    image: {
                        url: `attachment://${uuid}.png`,
                    },
                    footer: {
                        text: `Page ${this.page + 1}/${this.pageCount}`,
                    },
                    author: {
                        name: "PB2 Leaderboards Bot",
                        icon_url:
                            "https://cdn.discordapp.com/app-assets/720364938908008568/758752385244987423.png",
                    },
                },
            ],
            components: [arrowComponents],
            files: [attachment],
        };
    }
}

export default new Command({
    command: new SlashCommandBuilder()
        .setName("globaltop")
        .setDescription("Shows the global leaderboard")
        .setDMPermission(false)
        .addBooleanOption((option) =>
            option
                .setName("unbroken")
                .setDescription("Show leaderboard for scores that didn't break")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type of levels to show global leaderboard for")
                .setChoices(
                    { name: "all", value: "all" },
                    { name: "regular", value: "regular" },
                    { name: "challenge", value: "challenge" },
                    { name: "weekly", value: "weekly" },
                    { name: "bonus", value: "bonus" }
                )
                .setRequired(false)
        )
        .addStringOption((option) =>
            option.setName("user").setDescription("User to jump to").setRequired(false)
        )
        .addIntegerOption((option) =>
            option.setName("rank").setDescription("Rank to jump to").setRequired(false)
        )
        .addIntegerOption((option) =>
            option.setName("score").setDescription("Score to jump to").setRequired(false)
        )
        .addBooleanOption((option) =>
            option
                .setName("moneyspent")
                .setDescription("Display total money spent")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("world")
                .setDescription("Display for specific world(s): 1 - 6, 1c - 6c, B1, B2")
                .setRequired(false)
        )
        .toJSON(),
    run: async ({ interaction, client, args }) => {
        await interaction.deferReply();
        const category = (args.getString("type", false) ?? "all") as LevelCategory;
        const unbroken = args.getBoolean("unbroken", false) ?? false;
        const user = args.getString("user", false);
        const rank = args.getInteger("rank", false);
        const score = args.getInteger("score", false);
        const moneyspent = args.getBoolean("moneyspent", false) ?? false;
        const world = args.getString("world", false);

        let worldFilters: WorldFilter[] = [];
        if (world) {
            worldFilters = parseManyWorldFilters(world);
            if (worldFilters.length === 0) {
                await error(interaction, "Invalid world.");
                return;
            }
        }

        const type: LeaderboardType = unbroken ? "unbroken" : "any";
        const globalOptions: GlobalOptions = {
            type,
            levelCategory: category,
            worldFilters: worldFilters,
            scoreComputer: moneyspent ? "moneyspent" : "rank",
        };

        let userFilter: UserFilter | null = null;
        if (user) {
            userFilter = await pickUserFilter(user);
            if (!userFilter) {
                await pickUserFilterError(interaction);
                return;
            }
        }

        const board = await globalLeaderboard(globalOptions);
        if (!board) {
            await error(interaction, "Invalid argument combination");
            return;
        }

        const paged = new PagedGlobalLeaderboard(client, interaction, {
            board,
            options: { globalOptions, unbroken, userFilter, rank, score },
        });
        await paged.start();
    },
});
