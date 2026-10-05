// Attachments: turns picked, dropped or pasted files into what a message carries.
// Images are shrunk in the browser; text files are read as text.

export const MAX_FILES = 4;
export const MAX_TEXT_BYTES = 100 * 1024;
const MAX_IMAGE_SIDE = 1568;  // the size Claude and GPT read best; larger only costs more

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'env', 'log',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs',
  'rb', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql', 'lua', 'r', 'dart', 'vue', 'svelte', 'gradle', 'properties', 'dockerfile'];

const extension = name => (name.includes('.') ? name.split('.').pop() : name).toLowerCase();
export const isImage = file => IMAGE_TYPES.includes(file.type);
export const isText = file => file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSIONS.includes(extension(file.name));

// What the file picker offers: text files always, images only when the model can see them.
export const acceptFor = model => [...(model.images ? IMAGE_TYPES : []), ...TEXT_EXTENSIONS.map(e => '.' + e), 'text/*'].join(',');

// Reads one file. Returns an attachment, or throws an Error with a message for the user.
export async function readFile(file, model) {
  if (isImage(file)) {
    if (!model.images) throw new Error(`${model.name} can't read images. Pick another model to send pictures.`);
    return { kind: 'image', name: file.name || 'pasted-image.jpg', ...(await shrinkImage(file)) };
  }
  if (isText(file)) {
    if (file.size > MAX_TEXT_BYTES) throw new Error(`${file.name} is too big. Text files can be up to 100 KB.`);
    return { kind: 'text', name: file.name, text: await file.text() };
  }
  throw new Error(`${file.name} can't be attached. Use images or text/code files.`);
}

// Draws the image at most MAX_IMAGE_SIDE wide/tall and saves it as JPEG (white behind transparent parts).
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: w, height: h };
}

// Rough token count of attachments: images ≈ width × height / 750 (Anthropic's rule), text ≈ 4 characters per token.
export function attachmentTokens(list = []) {
  return list.reduce((n, a) => n + (a.kind === 'image' ? Math.ceil(((a.width || 1000) * (a.height || 1000)) / 750) : Math.ceil(a.text.length / 4)), 0);
}

export const fmtBytes = n => (n < 1024 ? n + ' B' : n < 1024 * 1024 ? Math.round(n / 1024) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB');
