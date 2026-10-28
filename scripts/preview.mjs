import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { outputs } from './build.mjs';

// 预览只提供内存 GM 存储和模拟响应，不连接 Peach 或来源站点。
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/preview.user.js') {
      const files = await outputs();
      const site = url.searchParams.get('site');
      const fixture = site === 'dmm' ? 'https://video.dmm.co.jp/av/content/?id=ssis00519'
        : site === 'mgs' ? 'https://www.mgstage.com/product/product_detail/300MIUM-1239/' : 'https://missav.ws/en/real-864';
      // 状态总览把各状态放进 iframe；正式脚本拒绝在框架里运行，只在预览构建里放开。
      const script = files.get('peach-jav.user.js').replace("  'use strict';", `  'use strict';
  const location = new URL(${JSON.stringify(fixture)});`).replace('if (window.top !== window.self) return;', '');
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(script);
    } else if (url.pathname === '/gallery') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(await readFile(new URL('./preview-gallery.html', import.meta.url)));
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(await readFile(new URL('./preview.html', import.meta.url)));
    }
  } catch {
    response.writeHead(500);
    response.end('预览构建失败，请查看源文件。');
  }
});
server.listen(8799, '127.0.0.1', () => console.log('Peach userscript 预览：http://127.0.0.1:8799/en/real-864'));
