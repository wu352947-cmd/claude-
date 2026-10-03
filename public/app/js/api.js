// 与服务端通信：同源 JSON，写请求带 x-sg 头（防跨站伪造）
export class ApiError extends Error {
  constructor(status, data) { super(data?.error || '网络开了个小差，请稍后再试'); this.status = status; this.data = data; }
}
async function call(method, path, body, raw) {
  const headers = { 'x-sg': '1' };
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = raw;
  let res;
  try { res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }); }
  catch { throw new ApiError(0, { error: '连不上网络，内容会在恢复后再保存' }); }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const api = {
  config: () => call('GET', '/api/config'),
  me: () => call('GET', '/api/me'),
  register: b => call('POST', '/api/auth/register', b),
  login: b => call('POST', '/api/auth/login', b),
  logout: () => call('POST', '/api/auth/logout', {}),
  updateMe: b => call('PATCH', '/api/me', b),
  deleteMe: password => call('DELETE', '/api/me', { password }),
  exportAll: () => call('GET', '/api/export'),
  entry: day => call('GET', `/api/entries/${day}`),
  saveEntry: (day, b) => call('PUT', `/api/entries/${day}`, b),
  seal: day => call('POST', `/api/entries/${day}/seal`, {}),
  reply: day => call('POST', `/api/entries/${day}/reply`, {}),
  month: m => call('GET', `/api/entries?month=${m}`),
  days: () => call('GET', '/api/entries'),
  letters: () => call('GET', '/api/letters'),
  sendLetter: b => call('POST', '/api/letters', b),
  openLetter: id => call('POST', `/api/letters/${id}/open`, {}),
  deleteLetter: id => call('DELETE', `/api/letters/${id}`),
  upload: (blob, type) => call('POST', '/api/uploads', blob, type),
  smsSend: (phone, purpose) => call('POST', '/api/auth/sms/send', { phone, purpose }),
  smsLogin: b => call('POST', '/api/auth/sms/login', b),
  resetPassword: b => call('POST', '/api/auth/reset', b),
  bindPhone: b => call('POST', '/api/me/phone', b),
  deleteMeByCode: code => call('DELETE', '/api/me', { code })
};
