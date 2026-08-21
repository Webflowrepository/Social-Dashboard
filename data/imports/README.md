# Manual CSV imports

Paste LinkedIn rows in `linkedin.csv` and Instagram rows in `instagram.csv`.

The hourly sync imports every CSV in this folder.

Required columns:

```csv
platform,title,url,imageUrl,publishedAt
```

Useful metric columns:

```csv
views,impressions,reach,likes,comments,shares,saves,clicks,score
```

Use `platform=linkedin` or `platform=instagram`.
Use `imageUrl` for the post image/reel thumbnail. Accepted aliases include `mediaUrl`, `thumbnail`, `thumbnailUrl`, `picture`, and `coverUrl`.
