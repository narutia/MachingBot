require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const discordToken = (process.env.TOKEN || process.env.DISCORD_TOKEN || "").trim();
const clientId = (process.env.CLIENT_ID || "").trim();
const guildId = (process.env.GUILD_ID || "").trim();
const commandScope = (process.argv[2] || process.env.COMMAND_SCOPE || "global")
  .trim()
  .toLowerCase();

const missing = [
  ["TOKEN", discordToken],
  ["CLIENT_ID", clientId]
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (!["global", "guild"].includes(commandScope)) {
  console.error("COMMAND_SCOPE must be either global or guild.");
  process.exit(1);
}

if (commandScope === "guild" && !guildId) {
  console.error("GUILD_ID is required when registering guild commands.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("scrim")
    .setDescription("スクリム機能")
    .addSubcommand(sub =>
      sub.setName("募集")
        .setDescription("24時間限定のスクリム募集を作成")
        .addStringOption(o => o.setName("team").setDescription("募集チーム名").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("候補時間 例: 22:00,22:30,23:00").setRequired(true))
        .addStringOption(o => o.setName("map").setDescription("候補マップ 例: アセント,ヘイブン,バインド").setRequired(true))
        .addStringOption(o => o.setName("mode").setDescription("形式 例: 1map,2map,3map").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("一覧").setDescription("募集中スクリム一覧"))
    .addSubcommand(sub =>
      sub.setName("キャンセル")
        .setDescription("自分の募集をキャンセル")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("締切")
        .setDescription("自分の募集を締め切る")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("申請取消")
        .setDescription("自分の申請を取り消す")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("確定キャンセル")
        .setDescription("確定済みスクリムをキャンセル")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("編集")
        .setDescription("自分の募集を編集")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("新しい候補時間").setRequired(false))
        .addStringOption(o => o.setName("map").setDescription("新しい候補マップ").setRequired(false))
        .addStringOption(o => o.setName("mode").setDescription("新しい形式").setRequired(false))
    )
    .addSubcommand(sub => sub.setName("履歴").setDescription("確定スクリム履歴")),

  new SlashCommandBuilder()
    .setName("team")
    .setDescription("チーム登録機能")
    .addSubcommand(sub =>
      sub.setName("登録")
        .setDescription("自分のチーム名を登録")
        .addStringOption(o => o.setName("name").setDescription("チーム名").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("確認").setDescription("登録済みチーム確認"))
    .addSubcommand(sub => sub.setName("削除").setDescription("登録済みチーム削除")),

  new SlashCommandBuilder()
    .setName("result")
    .setDescription("スクリム結果を記録")
    .addStringOption(o => o.setName("match").setDescription("例: A vs B").setRequired(true))
    .addStringOption(o => o.setName("score").setDescription("例: 13-8").setRequired(true))
    .addStringOption(o => o.setName("winner").setDescription("勝利チーム").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("ランキング表示"),

  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("管理者・運営用コマンド")
    .addSubcommand(sub =>
      sub.setName("募集削除")
        .setDescription("指定した募集を削除")
        .addIntegerOption(o => o.setName("id").setDescription("募集ID").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("募集全削除").setDescription("このサーバーの募集をすべて削除"))
    .addSubcommand(sub => sub.setName("結果全削除").setDescription("このサーバーの結果・ランキングを削除"))
    .addSubcommand(sub => sub.setName("全データ削除").setDescription("このサーバーの全データを削除"))
    .addSubcommand(sub => sub.setName("データ確認").setDescription("保存データ数を確認"))
    .addSubcommand(sub =>
      sub.setName("ログ設定")
        .setDescription("ログチャンネルを設定")
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("ログチャンネル")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("通知設定")
        .setDescription("スクリム確定・リマインド通知チャンネルを設定")
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("通知チャンネル")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("運営ロール設定")
        .setDescription("運営ロールを設定")
        .addRoleOption(o => o.setName("role").setDescription("運営ロール").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("設定確認").setDescription("サーバー設定を確認"))
    .addSubcommand(sub => sub.setName("停止").setDescription("このサーバーでBot機能を停止"))
    .addSubcommand(sub => sub.setName("再開").setDescription("このサーバーでBot機能を再開"))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(discordToken);

(async () => {
  try {
    console.log("コマンド登録中...");

    if (commandScope === "guild") {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log("サーバー用コマンド登録完了！");
      return;
    }

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log("グローバルコマンド登録完了！");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
