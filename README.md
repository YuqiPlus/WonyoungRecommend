# Dear Wonyoung · 张元英安利站

IVE 成员张元英的中文粉丝安利站。使用 GitHub Pages 托管静态网站，通过 GitHub Actions 自动部署，无需自备服务器。

网站地址：<https://20040831.xyz/>。

## 页面内容

- 人物资料与三步入坑指南。
- 六个官方 MV、直拍与团综入口，支持分类筛选和随机推荐。
- 收藏保存在浏览器 localStorage，无需登录；禁止存储时会提示无法持久保存。
- 生日倒计时按 `Asia/Shanghai` 日历日期计算；可下载每年重复的生日日历事件。
- 手机适配、键盘操作、减少动态效果支持；关闭 JavaScript 后仍可阅读内容、打开视频链接。

本站由粉丝独立制作，与艺人及所属公司无官方关联。人物资料链接到 IVE 官方资料，照片署名与授权见网页底部。

## 首次启用

1. 打开 [仓库的 Pages 设置](https://github.com/YuqiPlus/WonyoungRecommend/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 [Actions](https://github.com/YuqiPlus/WonyoungRecommend/actions)，选择 **Deploy website to GitHub Pages**，点击 **Run workflow**。
4. 等待部署成功后，访问 <https://yuqiplus.github.io/WonyoungRecommend/>。

**Source 必须选择 GitHub Actions。** 如果选择 `Deploy from a branch`，GitHub 的默认 Jekyll 流程会同时运行，并可能把仓库 README 发布成首页，覆盖本站。工作流会检查发布来源；遇到该错误时，修改 Source 后重新运行工作流即可。

免费账户使用 GitHub Pages 时，仓库需要为公开仓库；私有仓库需要支持 Pages 的付费方案。工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，不需要添加个人令牌或 SSH 密钥到 Actions。

## 编辑网站

网站文件位于 `site/`，无构建依赖：`index.html` 是内容，`styles.css` 是样式，`app.js` 是筛选、收藏和倒计时交互。`assets/` 保存图片、图标和日历事件。修改后推送到 `main` 会自动部署。

```bash
git add site
git commit -m "Update website"
git push origin main
```

图片、样式和页面链接请使用相对路径，例如 `./assets/photo.jpg`，以兼容默认网址的 `/WonyoungRecommend/` 路径和自定义域名。

本地预览：

```bash
python3 -m http.server 8000 --directory site
```

打开 <http://localhost:8000>。GitHub Pages 只托管静态文件，不能运行持续在线的 Python、PHP、Node.js 服务或数据库；GitHub Actions 负责部署任务。

## 绑定 Cloudflare 管理的域名

本项目准备使用 **20040831.xyz**。先完成默认网址的首次部署，再在 GitHub 仓库 **Settings → Pages → Custom domain** 填写 `20040831.xyz` 并保存，然后到 Cloudflare 添加下面的根域名记录。

### 可选的 www 子域名

| 类型 | 名称 | 目标 | 代理状态 |
| --- | --- | --- | --- |
| CNAME | www | yuqiplus.github.io | DNS only（灰色云朵） |

目标只填写 `yuqiplus.github.io`，不包含 `https://` 或 `/WonyoungRecommend/`。

### 根域名 20040831.xyz（必配）

| 类型 | 名称 | 目标 | 代理状态 |
| --- | --- | --- | --- |
| A | @ | 185.199.108.153 | DNS only（灰色云朵） |
| A | @ | 185.199.109.153 | DNS only（灰色云朵） |
| A | @ | 185.199.110.153 | DNS only（灰色云朵） |
| A | @ | 185.199.111.153 | DNS only（灰色云朵） |

这些记录在 Cloudflare 的 `20040831.xyz` 区域添加；`@` 表示根域名。仅检查并调整所选网站主机名上相冲突的记录，不影响邮件等其他 DNS 记录。等待 DNS 检查通过、证书签发后，在 GitHub Pages 勾选 **Enforce HTTPS**。DNS 生效和证书签发可能需要最多 24 小时。

绑定完成后，网站地址为 <https://20040831.xyz/>。

本项目使用 Actions 发布，自定义域名由 GitHub Pages 设置管理，添加 `CNAME` 文件不能代替该设置。

官方文档：[Actions 发布 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。
