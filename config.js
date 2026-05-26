// ============================================
// 公开配置文件（可安全提交到 GitHub）
// API Key 通过环境变量注入，不写死在代码中
// ============================================
const CONFIG = {
  // DeepSeek API 配置
  // 本地开发：在 config.local.js 中设置
  // 部署到 GitHub Pages：通过 GitHub Actions Secrets 注入
  DEEPSEEK_API_KEY: window.__DEEPSEEK_API_KEY__ || 'sk-你的APIKey',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
  
  // 每次生成名字数量
  NAMES_COUNT: 25,
};
