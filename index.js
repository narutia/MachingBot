require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const DATA_FILE =
  process.env.DATA_FILE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "data.json")
    : path.join(__dirname, "data.json"));

const MAX_OPEN_SCRIMS_PER_USER = 3;
const MAX_OPEN_SCRIMS_PER_GUILD = 20;
const SCRIM_CREATE_COOLDOWN_MS = 30 * 1000;

const createCooldowns = new Map();

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      scrims: [],
      results: [],
      teams: {},
      teamProfiles: {},
      pendingSelections: {},
      guildSettings: {}
    };
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  if (!data.scrims) data.scrims = [];
  if (!data.results) data.results = [];
  if (!data.teams) data.teams = {};
  if (!data.teamProfiles) data.teamProfiles = {};
  if (!data.pendingSelections) data.pendingSelections = {};
  if (!data.guildSettings) data.guildSettings = {};

  return data;
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getGuildSettings(data, guildId) {
  if (!data.guildSettings[guildId]) {
    data.guildSettings[guildId] = {
      logChannelId: null,
      notifyChannelId: null,
      staffRoleId: null,
      enabled: true
    };
  }
  return data.guildSettings[guildId];
}

function parseChoices(text) {
  return text
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function getGuildScrims(data, guildId) {
  return data.scrims.filter(s => s.guildId === guildId);
}

function getGuildResults(data, guildId) {
  return data.results.filter(r => r.guildId === guildId);
}

function getGuildTeams(data, guildId) {
  if (!data.teams[guildId]) data.teams[guildId] = {};
  return data.teams[guildId];
}

function getTeamProfiles(data, guildId) {
  if (!data.teamProfiles[guildId]) data.teamProfiles[guildId] = {};
  return data.teamProfiles[guildId];
}

function makePendingKey(guildId, scrimId, userId) {
  return `${guildId}_${scrimId}_${userId}`;
}

function findScrim(data, guildId, id) {
  return data.scrims.find(s => s.guildId === guildId && s.id === id);
}

function findApplicant(scrim, userId) {
  return scrim.applicants.find(a => a.userId === userId);
}

function isStaffOrAdmin(interaction, settings) {
  const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
  const envStaff = process.env.STAFF_ROLE_ID;
  const roleIds = [
    settings.staffRoleId,
    envStaff
  ].filter(Boolean);

  const hasStaffRole = roleIds.some(roleId => interaction.member.roles.cache.has(roleId));
  return Boolean(isAdmin || hasStaffRole);
}

function buildMainButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_${id}`)
      .setLabel("⚔️ 参加申請")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`manage_${id}`)
      .setLabel("📋 申請確認・承認")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`status_${id}`)
      .setLabel("🔍 自分の申請状況")
      .setStyle(ButtonStyle.Success)
  );
}

function buildScrimEmbed(scrim) {
  return new EmbedBuilder()
    .setTitle(`⚔️ スクリム募集 #${scrim.id}`)
    .setColor(0xff4655)
    .setDescription("参加したいチームは下のボタンから申請してください。")
    .addFields(
      { name: "🏷️ 募集チーム", value: scrim.hostTeam, inline: true },
      { name: "🎮 形式候補", value: scrim.mode, inline: true },
      { name: "🕒 時間候補", value: scrim.time, inline: true },
      { name: "🗺️ マップ候補", value: scrim.map, inline: true },
      { name: "📨 申請数", value: `${scrim.applicants.length}件`, inline: true },
      { name: "📌 状態", value: scrim.status, inline: true }
    )
    .setFooter({ text: "BigUkiUkiCup Scrim Matching" })
    .setTimestamp();
}

async function sendLog(client, data, guildId, text) {
  const settings = getGuildSettings(data, guildId);
  if (!settings.logChannelId) return;

  const channel = await client.channels.fetch(settings.logChannelId).catch(() => null);
  if (channel) await channel.send(text).catch(() => null);
}

async function updateScrimMessage(interaction, scrim) {
  try {
    if (!scrim.messageId) return;
    const channel = await interaction.client.channels.fetch(scrim.channelId).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(scrim.messageId);
    await msg.edit({
      embeds: [buildScrimEmbed(scrim)],
      components: [buildMainButtons(scrim.id)]
    });
  } catch (error) {
    console.log("募集メッセージ更新失敗:", error.message);
  }
}

async function sendConfirm(client, data, scrim, applicant) {
  const settings = getGuildSettings(data, scrim.guildId);
  const channelId = settings.notifyChannelId || scrim.channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("✅ スクリム確定")
    .setColor(0x57f287)
    .setDescription("対戦カードが確定しました。")
    .addFields(
      { name: "⚔️ 対戦", value: `${scrim.hostTeam} vs ${applicant.teamName}` },
      { name: "募集者", value: `<@${scrim.hostId}>`, inline: true },
      { name: "申請者", value: `<@${applicant.userId}>`, inline: true },
      { name: "🎮 形式", value: applicant.selectedMode, inline: true },
      { name: "🕒 時間", value: applicant.selectedTime, inline: true },
      { name: "🗺️ マップ", value: applicant.selectedMap, inline: true }
    )
    .setFooter({ text: "Good luck, have fun!" })
    .setTimestamp();

  await channel.send({
    content: `🚨 スクリム確定通知 🚨\n<@${scrim.hostId}> vs <@${applicant.userId}>`,
    embeds: [embed]
  });
}

function ensureEnabled(interaction, settings) {
  if (settings.enabled) return false;
  if (interaction.commandName === "admin") return false;

  return interaction.reply({
    content: "このサーバーでは現在Bot機能が停止されています。",
    ephemeral: true
  });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("clientReady", () => {
  console.log(`${client.user.tag} 起動完了`);
  console.log(`Data file: ${DATA_FILE}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.guildId) {
    return interaction.reply?.({
      content: "このBotはサーバー内でのみ使用できます。",
      ephemeral: true
    }).catch(() => null);
  }

  const data = loadData();
  const guildId = interaction.guildId;
  const settings = getGuildSettings(data, guildId);

  if (interaction.isChatInputCommand()) {
    const disabledReply = ensureEnabled(interaction, settings);
    if (disabledReply) return disabledReply;

    if (interaction.commandName === "team") {
      const sub = interaction.options.getSubcommand();
      const profiles = getTeamProfiles(data, guildId);

      if (sub === "登録") {
        const name = interaction.options.getString("name");
        profiles[interaction.user.id] = name;
        saveData(data);

        await sendLog(client, data, guildId, `📝 チーム登録: <@${interaction.user.id}> → ${name}`);

        return interaction.reply({
          content: `チーム名を登録しました：${name}`,
          ephemeral: true
        });
      }

      if (sub === "確認") {
        const name = profiles[interaction.user.id];
        return interaction.reply({
          content: name ? `登録チーム：${name}` : "未登録です。",
          ephemeral: true
        });
      }

      if (sub === "削除") {
        delete profiles[interaction.user.id];
        saveData(data);

        await sendLog(client, data, guildId, `🗑️ チーム登録削除: <@${interaction.user.id}>`);

        return interaction.reply({
          content: "登録チーム名を削除しました。",
          ephemeral: true
        });
      }
    }

    if (interaction.commandName === "scrim") {
      const sub = interaction.options.getSubcommand();

      if (sub === "募集") {
        const now = Date.now();
        const cooldownKey = `${guildId}_${interaction.user.id}`;
        const lastCreated = createCooldowns.get(cooldownKey) || 0;

        if (now - lastCreated < SCRIM_CREATE_COOLDOWN_MS) {
          const wait = Math.ceil((SCRIM_CREATE_COOLDOWN_MS - (now - lastCreated)) / 1000);
          return interaction.reply({
            content: `連続募集を防止しています。あと${wait}秒待ってください。`,
            ephemeral: true
          });
        }

        const guildOpen = getGuildScrims(data, guildId).filter(s => s.status === "募集中");
        const userOpen = guildOpen.filter(s => s.hostId === interaction.user.id);

        if (guildOpen.length >= MAX_OPEN_SCRIMS_PER_GUILD) {
          return interaction.reply({
            content: `このサーバーの募集中スクリム数が上限（${MAX_OPEN_SCRIMS_PER_GUILD}件）に達しています。`,
            ephemeral: true
          });
        }

        if (userOpen.length >= MAX_OPEN_SCRIMS_PER_USER) {
          return interaction.reply({
            content: `同時に作成できる募集は${MAX_OPEN_SCRIMS_PER_USER}件までです。`,
            ephemeral: true
          });
        }

        const team = interaction.options.getString("team");
        const timeOptions = parseChoices(interaction.options.getString("time"));
        const mapOptions = parseChoices(interaction.options.getString("map"));
        const modeOptions = parseChoices(interaction.options.getString("mode"));

        if (timeOptions.length === 0 || mapOptions.length === 0 || modeOptions.length === 0) {
          return interaction.reply({
            content: "時間・マップ・形式は最低1つ以上入力してください。",
            ephemeral: true
          });
        }

        const guildScrims = getGuildScrims(data, guildId);
        const id = guildScrims.length > 0 ? Math.max(...guildScrims.map(s => s.id)) + 1 : 1;

        const scrim = {
          id,
          guildId,
          channelId: interaction.channelId,
          hostId: interaction.user.id,
          hostTeam: team,
          timeOptions,
          mapOptions,
          modeOptions,
          time: timeOptions.join(" / "),
          map: mapOptions.join(" / "),
          mode: modeOptions.join(" / "),
          status: "募集中",
          createdAt: Date.now(),
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          applicants: [],
          rejected: [],
          selected: null,
          selectedTeamName: null,
          selectedMode: null,
          selectedTime: null,
          selectedMap: null,
          messageId: null,
          reminded: false
        };

        data.scrims.push(scrim);
        saveData(data);
        createCooldowns.set(cooldownKey, now);

        const msg = await interaction.reply({
          embeds: [buildScrimEmbed(scrim)],
          components: [buildMainButtons(id)],
          fetchReply: true
        });

        scrim.messageId = msg.id;
        saveData(data);

        await sendLog(client, data, guildId, `📢 募集作成 #${id}: ${team} by <@${interaction.user.id}>`);

        return;
      }

      if (sub === "一覧") {
        const open = getGuildScrims(data, guildId).filter(s => s.status === "募集中");

        if (open.length === 0) {
          return interaction.reply({
            content: "募集中のスクリムはありません。",
            ephemeral: true
          });
        }

        const text = open.map(s =>
          `#${s.id} ${s.hostTeam}\n形式：${s.mode}\n時間：${s.time}\nマップ：${s.map}\n申請：${s.applicants.length}件`
        ).join("\n\n");

        return interaction.reply({
          content: `【募集中スクリム一覧】\n\n${text}`,
          ephemeral: true
        });
      }

      if (sub === "キャンセル" || sub === "締切") {
        const id = interaction.options.getInteger("id");
        const scrim = findScrim(data, guildId, id);

        if (!scrim) {
          return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
        }

        if (scrim.hostId !== interaction.user.id) {
          return interaction.reply({ content: "自分の募集のみ操作できます。", ephemeral: true });
        }

        if (scrim.status !== "募集中") {
          return interaction.reply({ content: `この募集はすでに「${scrim.status}」です。`, ephemeral: true });
        }

        scrim.status = sub === "キャンセル" ? "キャンセル" : "締切";
        saveData(data);

        await updateScrimMessage(interaction, scrim);
        await sendLog(client, data, guildId, `${sub === "キャンセル" ? "🚫" : "🔒"} ${sub}: #${id}`);

        return interaction.reply({
          content: `#${id} を${sub}しました。`,
          ephemeral: true
        });
      }

      if (sub === "申請取消") {
        const id = interaction.options.getInteger("id");
        const scrim = findScrim(data, guildId, id);

        if (!scrim) {
          return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
        }

        if (scrim.status !== "募集中") {
          return interaction.reply({ content: "募集中のスクリムのみ申請取消できます。", ephemeral: true });
        }

        const before = scrim.applicants.length;
        scrim.applicants = scrim.applicants.filter(a => a.userId !== interaction.user.id);

        if (before === scrim.applicants.length) {
          return interaction.reply({ content: "この募集には申請していません。", ephemeral: true });
        }

        saveData(data);
        await updateScrimMessage(interaction, scrim);
        await sendLog(client, data, guildId, `↩️ 申請取消 #${id}: <@${interaction.user.id}>`);

        return interaction.reply({
          content: `#${id} への申請を取り消しました。`,
          ephemeral: true
        });
      }

      if (sub === "確定キャンセル") {
        const id = interaction.options.getInteger("id");
        const scrim = findScrim(data, guildId, id);

        if (!scrim) {
          return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
        }

        if (scrim.status !== "確定") {
          return interaction.reply({ content: "確定済みスクリムのみキャンセルできます。", ephemeral: true });
        }

        if (scrim.hostId !== interaction.user.id && !isStaffOrAdmin(interaction, settings)) {
          return interaction.reply({ content: "募集者または運営のみキャンセルできます。", ephemeral: true });
        }

        scrim.status = "キャンセル";
        saveData(data);

        await updateScrimMessage(interaction, scrim);
        await sendLog(client, data, guildId, `❌ 確定キャンセル #${id}`);

        return interaction.reply({
          content: `#${id} の確定スクリムをキャンセルしました。`,
          ephemeral: true
        });
      }

      if (sub === "編集") {
        const id = interaction.options.getInteger("id");
        const scrim = findScrim(data, guildId, id);

        if (!scrim) {
          return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
        }

        if (scrim.hostId !== interaction.user.id) {
          return interaction.reply({ content: "自分の募集のみ編集できます。", ephemeral: true });
        }

        if (scrim.status !== "募集中") {
          return interaction.reply({ content: "募集中のものだけ編集できます。", ephemeral: true });
        }

        const newTime = interaction.options.getString("time");
        const newMap = interaction.options.getString("map");
        const newMode = interaction.options.getString("mode");

        if (!newTime && !newMap && !newMode) {
          return interaction.reply({
            content: "変更する項目を1つ以上入力してください。",
            ephemeral: true
          });
        }

        if (newTime) {
          scrim.timeOptions = parseChoices(newTime);
          scrim.time = scrim.timeOptions.join(" / ");
        }

        if (newMap) {
          scrim.mapOptions = parseChoices(newMap);
          scrim.map = scrim.mapOptions.join(" / ");
        }

        if (newMode) {
          scrim.modeOptions = parseChoices(newMode);
          scrim.mode = scrim.modeOptions.join(" / ");
        }

        saveData(data);
        await updateScrimMessage(interaction, scrim);
        await sendLog(client, data, guildId, `✏️ 募集編集 #${id}`);

        return interaction.reply({
          content: `#${id} を編集しました。`,
          ephemeral: true
        });
      }

      if (sub === "履歴") {
        const done = getGuildScrims(data, guildId).filter(s => s.status === "確定");

        if (done.length === 0) {
          return interaction.reply({
            content: "履歴はありません。",
            ephemeral: true
          });
        }

        const text = done.slice(-10).map(s =>
          `#${s.id} ${s.hostTeam} vs ${s.selectedTeamName}\n形式：${s.selectedMode} / 時間：${s.selectedTime} / マップ：${s.selectedMap}`
        ).join("\n\n");

        return interaction.reply({
          content: `【スクリム履歴】\n\n${text}`,
          ephemeral: true
        });
      }
    }

    if (interaction.commandName === "result") {
      const match = interaction.options.getString("match");
      const score = interaction.options.getString("score");
      const winner = interaction.options.getString("winner");

      data.results.push({
        guildId,
        match,
        score,
        winner,
        reportedBy: interaction.user.id,
        createdAt: Date.now()
      });

      const teams = getGuildTeams(data, guildId);
      if (!teams[winner]) teams[winner] = { win: 0, games: 0 };
      teams[winner].win += 1;
      teams[winner].games += 1;

      saveData(data);
      await sendLog(client, data, guildId, `🏁 結果登録: ${match} / ${score} / 勝者 ${winner}`);

      return interaction.reply({
        content: `結果を記録しました。\n${match}\n${score}\n勝者：${winner}`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "ranking") {
      const teams = getGuildTeams(data, guildId);
      const ranking = Object.entries(teams).sort((a, b) => b[1].win - a[1].win);

      if (ranking.length === 0) {
        return interaction.reply({ content: "ランキングはまだありません。", ephemeral: true });
      }

      const text = ranking.map(([team, r], i) => {
        const rate = r.games > 0 ? Math.round((r.win / r.games) * 100) : 0;
        return `${i + 1}位：${team}　${r.win}勝 / ${r.games}試合 / 勝率${rate}%`;
      }).join("\n");

      const embed = new EmbedBuilder()
        .setTitle("🏆 スクリムランキング")
        .setColor(0xf1c40f)
        .setDescription(text)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "admin") {
      if (!isStaffOrAdmin(interaction, settings)) {
        return interaction.reply({
          content: "このコマンドは管理者または運営ロールのみ使用できます。",
          ephemeral: true
        });
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "ログ設定") {
        const channel = interaction.options.getChannel("channel");
        settings.logChannelId = channel.id;
        saveData(data);

        return interaction.reply({
          content: `ログチャンネルを ${channel} に設定しました。`,
          ephemeral: true
        });
      }

      if (sub === "通知設定") {
        const channel = interaction.options.getChannel("channel");
        settings.notifyChannelId = channel.id;
        saveData(data);

        return interaction.reply({
          content: `通知チャンネルを ${channel} に設定しました。`,
          ephemeral: true
        });
      }

      if (sub === "運営ロール設定") {
        const role = interaction.options.getRole("role");
        settings.staffRoleId = role.id;
        saveData(data);

        return interaction.reply({
          content: `運営ロールを ${role} に設定しました。`,
          ephemeral: true
        });
      }

      if (sub === "設定確認") {
        return interaction.reply({
          content:
            `【サーバー設定】\n` +
            `ログチャンネル：${settings.logChannelId ? `<#${settings.logChannelId}>` : "未設定"}\n` +
            `通知チャンネル：${settings.notifyChannelId ? `<#${settings.notifyChannelId}>` : "未設定"}\n` +
            `運営ロール：${settings.staffRoleId ? `<@&${settings.staffRoleId}>` : "未設定"}\n` +
            `Bot状態：${settings.enabled ? "稼働中" : "停止中"}`,
          ephemeral: true
        });
      }

      if (sub === "停止") {
        settings.enabled = false;
        saveData(data);

        return interaction.reply({ content: "このサーバーでBot機能を停止しました。", ephemeral: true });
      }

      if (sub === "再開") {
        settings.enabled = true;
        saveData(data);

        return interaction.reply({ content: "このサーバーでBot機能を再開しました。", ephemeral: true });
      }

      if (sub === "募集削除") {
        const id = interaction.options.getInteger("id");
        const before = data.scrims.length;
        data.scrims = data.scrims.filter(s => !(s.guildId === guildId && s.id === id));
        saveData(data);

        if (before === data.scrims.length) {
          return interaction.reply({ content: `#${id} は見つかりませんでした。`, ephemeral: true });
        }

        return interaction.reply({ content: `#${id} を削除しました。`, ephemeral: true });
      }

      if (sub === "募集全削除") {
        data.scrims = data.scrims.filter(s => s.guildId !== guildId);

        for (const key of Object.keys(data.pendingSelections)) {
          if (key.startsWith(`${guildId}_`)) delete data.pendingSelections[key];
        }

        saveData(data);
        return interaction.reply({ content: "このサーバーの募集をすべて削除しました。", ephemeral: true });
      }

      if (sub === "結果全削除") {
        data.results = data.results.filter(r => r.guildId !== guildId);
        data.teams[guildId] = {};
        saveData(data);

        return interaction.reply({ content: "このサーバーの結果・ランキングを削除しました。", ephemeral: true });
      }

      if (sub === "全データ削除") {
        data.scrims = data.scrims.filter(s => s.guildId !== guildId);
        data.results = data.results.filter(r => r.guildId !== guildId);
        data.teams[guildId] = {};
        data.teamProfiles[guildId] = {};

        for (const key of Object.keys(data.pendingSelections)) {
          if (key.startsWith(`${guildId}_`)) delete data.pendingSelections[key];
        }

        saveData(data);
        return interaction.reply({ content: "このサーバーの全データを削除しました。", ephemeral: true });
      }

      if (sub === "データ確認") {
        const scrims = getGuildScrims(data, guildId);
        const results = getGuildResults(data, guildId);
        const teams = getGuildTeams(data, guildId);
        const profiles = getTeamProfiles(data, guildId);

        return interaction.reply({
          content:
            `募集数：${scrims.length}\n` +
            `募集中：${scrims.filter(s => s.status === "募集中").length}\n` +
            `結果数：${results.length}\n` +
            `ランキング登録数：${Object.keys(teams).length}\n` +
            `チーム登録数：${Object.keys(profiles).length}`,
          ephemeral: true
        });
      }
    }
  }

  if (interaction.isButton()) {
    const disabledReply = ensureEnabled(interaction, settings);
    if (disabledReply) return disabledReply;

    const [action, idText, targetUserId] = interaction.customId.split("_");
    const scrimId = Number(idText);
    const scrim = findScrim(data, guildId, scrimId);

    if (!scrim) {
      return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
    }

    if (action === "join") {
      if (scrim.status !== "募集中") {
        return interaction.reply({ content: "この募集は終了しています。", ephemeral: true });
      }

      if (Date.now() > scrim.deadline) {
        scrim.status = "期限切れ";
        saveData(data);
        await updateScrimMessage(interaction, scrim);

        return interaction.reply({ content: "この募集は期限切れです。", ephemeral: true });
      }

      if (interaction.user.id === scrim.hostId) {
        return interaction.reply({ content: "自分の募集には申請できません。", ephemeral: true });
      }

      if (scrim.rejected.includes(interaction.user.id)) {
        return interaction.reply({ content: "この募集ではすでに拒否されています。", ephemeral: true });
      }

      if (scrim.applicants.some(a => a.userId === interaction.user.id)) {
        return interaction.reply({ content: "すでに申請済みです。", ephemeral: true });
      }

      const key = makePendingKey(guildId, scrimId, interaction.user.id);
      data.pendingSelections[key] = {};
      saveData(data);

      const modeSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`selectMode_${scrimId}`)
          .setPlaceholder("練習形式を選択")
          .addOptions(scrim.modeOptions.map(v => ({ label: v, value: v })))
      );

      const timeSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`selectTime_${scrimId}`)
          .setPlaceholder("希望時間を選択")
          .addOptions(scrim.timeOptions.map(v => ({ label: v, value: v })))
      );

      const mapSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`selectMap_${scrimId}`)
          .setPlaceholder("希望マップを選択")
          .addOptions(scrim.mapOptions.map(v => ({ label: v, value: v })))
      );

      const nextButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`openModal_${scrimId}`)
          .setLabel("チーム名入力へ")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        content: "形式・時間・マップを選んでから、チーム名入力へ進んでください。",
        components: [modeSelect, timeSelect, mapSelect, nextButton],
        ephemeral: true
      });
    }

    if (action === "openModal") {
      const key = makePendingKey(guildId, scrimId, interaction.user.id);
      const selected = data.pendingSelections[key];

      if (!selected || !selected.mode || !selected.time || !selected.map) {
        return interaction.reply({ content: "形式・時間・マップをすべて選んでください。", ephemeral: true });
      }

      const profiles = getTeamProfiles(data, guildId);
      const defaultName = profiles[interaction.user.id] || "";

      const modal = new ModalBuilder()
        .setCustomId(`joinModal_${scrimId}`)
        .setTitle("スクリム参加申請");

      const input = new TextInputBuilder()
        .setCustomId("teamName")
        .setLabel("参加するチーム名")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (defaultName) input.setValue(defaultName);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === "manage") {
      if (interaction.user.id !== scrim.hostId) {
        return interaction.reply({ content: "募集者のみ操作できます。", ephemeral: true });
      }

      if (scrim.status !== "募集中") {
        return interaction.reply({ content: `この募集は「${scrim.status}」です。`, ephemeral: true });
      }

      if (scrim.applicants.length === 0) {
        return interaction.reply({ content: "まだ申請はありません。", ephemeral: true });
      }

      const applicants = scrim.applicants.slice(0, 5);

      const rows = applicants.map(applicant =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_${scrimId}_${applicant.userId}`)
            .setLabel(`承認：${applicant.teamName}`.slice(0, 80))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`reject_${scrimId}_${applicant.userId}`)
            .setLabel(`拒否：${applicant.teamName}`.slice(0, 80))
            .setStyle(ButtonStyle.Danger)
        )
      );

      const list = applicants.map((a, i) =>
        `${i + 1}. ${a.teamName} / <@${a.userId}>\n形式：${a.selectedMode} / 時間：${a.selectedTime} / マップ：${a.selectedMap}`
      ).join("\n\n");

      return interaction.reply({
        content: `#${scrimId} 申請一覧\n\n${list}`,
        components: rows,
        ephemeral: true
      });
    }

    if (action === "reject") {
      if (interaction.user.id !== scrim.hostId) {
        return interaction.reply({ content: "募集者のみ操作できます。", ephemeral: true });
      }

      const applicant = findApplicant(scrim, targetUserId);
      if (!applicant) {
        return interaction.reply({ content: "申請者が見つかりません。", ephemeral: true });
      }

      scrim.applicants = scrim.applicants.filter(a => a.userId !== targetUserId);
      if (!scrim.rejected.includes(targetUserId)) scrim.rejected.push(targetUserId);

      saveData(data);
      await updateScrimMessage(interaction, scrim);
      await sendLog(client, data, guildId, `❌ 拒否 #${scrimId}: ${applicant.teamName}`);

      return interaction.reply({ content: `${applicant.teamName} を拒否しました。`, ephemeral: true });
    }

    if (action === "approve") {
      if (interaction.user.id !== scrim.hostId) {
        return interaction.reply({ content: "募集者のみ操作できます。", ephemeral: true });
      }

      if (scrim.status !== "募集中") {
        return interaction.reply({ content: "この募集は終了しています。", ephemeral: true });
      }

      const applicant = findApplicant(scrim, targetUserId);
      if (!applicant) {
        return interaction.reply({ content: "申請者が見つかりません。", ephemeral: true });
      }

      scrim.status = "確定";
      scrim.selected = targetUserId;
      scrim.selectedTeamName = applicant.teamName;
      scrim.selectedMode = applicant.selectedMode;
      scrim.selectedTime = applicant.selectedTime;
      scrim.selectedMap = applicant.selectedMap;

      saveData(data);
      await updateScrimMessage(interaction, scrim);
      await sendConfirm(client, data, scrim, applicant);
      await sendLog(client, data, guildId, `✅ 承認 #${scrimId}: ${scrim.hostTeam} vs ${applicant.teamName}`);

      return interaction.reply({
        content:
          `${applicant.teamName} を承認しました。\n` +
          `形式：${applicant.selectedMode}\n時間：${applicant.selectedTime}\nマップ：${applicant.selectedMap}`,
        ephemeral: true
      });
    }

    if (action === "status") {
      const applicant = findApplicant(scrim, interaction.user.id);

      if (scrim.selected === interaction.user.id) {
        return interaction.reply({
          content:
            `承認されています！\n` +
            `${scrim.hostTeam} vs ${scrim.selectedTeamName}\n` +
            `形式：${scrim.selectedMode}\n時間：${scrim.selectedTime}\nマップ：${scrim.selectedMap}`,
          ephemeral: true
        });
      }

      if (scrim.status === "確定" && applicant) {
        return interaction.reply({ content: "今回は選ばれませんでした。", ephemeral: true });
      }

      if (scrim.rejected.includes(interaction.user.id)) {
        return interaction.reply({ content: "あなたの申請は拒否されました。", ephemeral: true });
      }

      if (applicant) {
        return interaction.reply({
          content:
            `申請中です。\n` +
            `チーム名：${applicant.teamName}\n形式：${applicant.selectedMode}\n時間：${applicant.selectedTime}\nマップ：${applicant.selectedMap}`,
          ephemeral: true
        });
      }

      return interaction.reply({ content: "この募集には申請していません。", ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const disabledReply = ensureEnabled(interaction, settings);
    if (disabledReply) return disabledReply;

    const [action, idText] = interaction.customId.split("_");
    const key = makePendingKey(guildId, Number(idText), interaction.user.id);

    if (!data.pendingSelections[key]) data.pendingSelections[key] = {};

    if (action === "selectMode") data.pendingSelections[key].mode = interaction.values[0];
    if (action === "selectTime") data.pendingSelections[key].time = interaction.values[0];
    if (action === "selectMap") data.pendingSelections[key].map = interaction.values[0];

    saveData(data);

    const selected = data.pendingSelections[key];

    return interaction.update({
      content:
        `選択中\n` +
        `形式：${selected.mode || "未選択"}\n` +
        `時間：${selected.time || "未選択"}\n` +
        `マップ：${selected.map || "未選択"}\n\n` +
        `すべて選んだら「チーム名入力へ」を押してください。`,
      components: interaction.message.components
    });
  }

  if (interaction.isModalSubmit()) {
    const disabledReply = ensureEnabled(interaction, settings);
    if (disabledReply) return disabledReply;

    if (!interaction.customId.startsWith("joinModal_")) return;

    const scrimId = Number(interaction.customId.replace("joinModal_", ""));
    const scrim = findScrim(data, guildId, scrimId);

    if (!scrim) {
      return interaction.reply({ content: "募集が見つかりません。", ephemeral: true });
    }

    if (scrim.status !== "募集中") {
      return interaction.reply({ content: "この募集は終了しています。", ephemeral: true });
    }

    const key = makePendingKey(guildId, scrimId, interaction.user.id);
    const selected = data.pendingSelections[key];

    if (!selected || !selected.mode || !selected.time || !selected.map) {
      return interaction.reply({ content: "選択データが見つかりません。もう一度申請してください。", ephemeral: true });
    }

    if (scrim.applicants.some(a => a.userId === interaction.user.id)) {
      return interaction.reply({ content: "すでに申請済みです。", ephemeral: true });
    }

    const teamName = interaction.fields.getTextInputValue("teamName");

    scrim.applicants.push({
      userId: interaction.user.id,
      teamName,
      selectedMode: selected.mode,
      selectedTime: selected.time,
      selectedMap: selected.map
    });

    const profiles = getTeamProfiles(data, guildId);
    profiles[interaction.user.id] = teamName;

    delete data.pendingSelections[key];

    saveData(data);
    await updateScrimMessage(interaction, scrim);
    await sendLog(client, data, guildId, `📨 申請 #${scrimId}: ${teamName} by <@${interaction.user.id}>`);

    return interaction.reply({
      content:
        `参加申請しました。\n` +
        `チーム名：${teamName}\n形式：${selected.mode}\n時間：${selected.time}\nマップ：${selected.map}`,
      ephemeral: true
    });
  }
});

setInterval(async () => {
  const data = loadData();
  const now = Date.now();

  let changed = false;

  for (const scrim of data.scrims) {
    if (scrim.status === "募集中" && scrim.deadline && now > scrim.deadline) {
      scrim.status = "期限切れ";
      changed = true;
    }

    if (scrim.status === "確定" && !scrim.reminded) {
      const settings = getGuildSettings(data, scrim.guildId);
      const channelId = settings.notifyChannelId || scrim.channelId;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;

      const [hour, minute] = String(scrim.selectedTime || "").split(":").map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

      const today = new Date();
      const matchTime = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hour,
        minute
      ).getTime();

      const diff = matchTime - now;

      if (diff > 0 && diff <= 10 * 60 * 1000) {
        scrim.reminded = true;
        changed = true;

        await channel.send(`⏰ スクリム開始10分前です！\n<@${scrim.hostId}> vs <@${scrim.selected}>`);
      }
    }
  }

  const before = data.scrims.length;
  data.scrims = data.scrims.filter(scrim => {
    if (scrim.status === "確定") return true;
    if (!scrim.createdAt) return true;

    const age = now - scrim.createdAt;

    if (["期限切れ", "キャンセル", "締切"].includes(scrim.status) && age > 3 * 24 * 60 * 60 * 1000) {
      return false;
    }

    return true;
  });

  if (before !== data.scrims.length) changed = true;

  if (changed) saveData(data);
}, 60 * 1000);

const discordToken = (process.env.TOKEN || process.env.DISCORD_TOKEN || "").trim();

if (!discordToken) {
  console.error("Missing Discord bot token. Set TOKEN in Railway service Variables.");
  process.exit(1);
}

client.login(discordToken);
