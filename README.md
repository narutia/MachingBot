#  Maching Bot

Discord.js のスクリム募集Botを Railway で公開運用するための構成です。

## 必要な環境変数

Railway の Service Variables に設定します。

```env
TOKEN=Discord Bot Token
CLIENT_ID=Discord Application ID
COMMAND_SCOPE=global
```

`GUILD_ID` は公開運用では設定しません。テストサーバーだけにコマンドを即時反映したいときだけ、ローカルの `.env` に `GUILD_ID` を入れて `npm run register:guild` を使います。

## ローカル確認

```bash
npm install
npm run check
npm run register:global
npm run invite
npm start
```

`npm run invite` で表示されたURLを配ると、他のサーバー管理者がBotを追加できます。

## Railway デプロイ

1. このリポジトリを GitHub に push
2. Railway で `New Project` → `Deploy from GitHub repo`
3. Service Variables に `TOKEN`、`CLIENT_ID`、`COMMAND_SCOPE=global` を追加
4. 必要なら Volume を接続して、Mount Path を `/data` にする
5. Deploy

Railway の Volume がある場合、このBotは自動で `/data/data.json` にデータを保存します。

## 公開前の Discord 設定

Discord Developer Portal の対象Applicationで確認します。

- Bot Token を発行して `TOKEN` に設定
- General Information の Application ID を `CLIENT_ID` に設定
- Bot の `Public Bot` を ON
- Bot の `Requires OAuth2 Code Grant` を OFF
- Installation / OAuth2 の Guild Install に `bot` と `applications.commands` を含める

## コマンド登録

公開用:

```bash
npm run register:global
```

テストサーバーだけ:

```bash
npm run register:guild
```

グローバルコマンドは反映に少し時間がかかる場合があります。
