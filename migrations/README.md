# Migrations

Hand-run SQL; there is no migration runner. Run each file once, in number order, before deploying the code that needs it:

| File | What it does |
|---|---|
| `000-base-schema.sql` | `tickets` and `ratings` tables |
| `001-add-festival-link.sql` | `tickets.festival_link` |
| `002-multi-user-multi-year.sql` | Ticket owners, festival years, `starts_at`, QR hashes, groups. **Edit first:** it assigns existing tickets to `owner@example.com` and seeds a group with `member@example.com`; put in your own addresses and group name. |
| `003-ticket-holders-and-profiles.sql` | `tickets.holder_email`, `profiles` |
| `004-profile-badges.sql` | `profiles.badge` |
| `005-screening-end-and-qa.sql` | `tickets.ends_at`, `tickets.has_qa` |
| `006-vote-links.sql` | Forwarding tokens and `vote_links` |

Schema changes use `IF NOT EXISTS`, so re-running them does nothing. Data changes are a different matter: don't replay `002` on a database that has run it, because its seed only checks current membership, and if the seeded owner has since left every group it creates the group and both memberships again. When you add a migration, give it the next number, update `lib/types.ts` and the row mapping in `lib/db.ts`, and add it to this table.
