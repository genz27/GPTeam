# GPTeam

ChatGPT Team 邀请管理系统

## 快速部署

```bash
docker run -d \
  --name gpteam \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e ADMIN_PASSWORD=your_password \
  ghcr.io/genz27/gpteam:latest
```

## Docker Compose

```yaml
version: '3.8'
services:
  app:
    image: ghcr.io/genz27/gpteam:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - ADMIN_PASSWORD=your_password
    restart: unless-stopped
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| ADMIN_PASSWORD | 管理员密码 | admin123 |
| DB_PATH | 数据库路径 | /app/data/data.db |

## 访问

- 首页: `http://localhost:3000`
- 管理后台: `http://localhost:3000/admin`
