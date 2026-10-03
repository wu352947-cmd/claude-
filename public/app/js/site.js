// 站点环境：正式版用绝对路径；在线试玩版（Artifact）改成相对路径、照片存在本机、不能下载文件
import { h, toast } from './ui.js';

export const SITE = { root: '/', home: '/', demo: false, photo: id => `/api/uploads/${encodeURIComponent(id)}` };
export const url = p => SITE.root + String(p).replace(/^\//, '');
export const photoUrl = id => SITE.photo(id);

export function saveFile(blob, name) {
  if (SITE.demo) { toast('试玩版不能下载文件，正式版可以导出保存'); return false; }
  const u = URL.createObjectURL(blob), a = h(`<a href="${u}" download="${name}"></a>`);
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 8000);
  return true;
}
export const leaveSite = () => { if (SITE.demo) location.reload(); else location.href = SITE.home; };
