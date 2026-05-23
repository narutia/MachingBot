# Privacy Policy

Last updated: 2026-05-23

BigUkiUki Scrim Bot stores only the data needed to provide scrim matching features.

## Data Stored

The bot may store:

- Discord server IDs
- Discord user IDs
- Team names entered by users
- Scrim listings, applications, approvals, cancellations, and match results
- Server-specific bot settings such as log channel, notification channel, and staff role IDs

The bot does not intentionally store message contents outside of command inputs and interaction data needed for the bot features.

## How Data Is Used

Stored data is used to:

- Manage scrim listings and applications
- Show scrim history and rankings
- Remember team names and server settings
- Send confirmation, log, and reminder messages

Data is separated by Discord server ID.

## Data Sharing

The bot operator does not sell stored data. Data is only processed by the hosting provider and database provider used to run the bot.

## Data Retention

Canceled, closed, and expired scrim listings may be removed automatically after several days. Confirmed scrim history, rankings, team profiles, and server settings may remain until a server administrator deletes them using bot admin commands or requests deletion.

## Data Deletion

Server administrators can use admin commands to delete server data:

- `/admin 募集全削除`
- `/admin 結果全削除`
- `/admin 全データ削除`

If additional deletion support is needed, contact the bot operator.

## Security

Bot tokens and database credentials are stored as environment variables in the hosting platform. Public repositories must not include `.env`, tokens, or database files.

## Contact

For privacy or data deletion requests, contact the bot operator through the Discord server or GitHub repository where this bot is published.
