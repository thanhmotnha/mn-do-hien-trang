#!/usr/bin/env node
// Chép src/mncf-phong.js của kho mn-chenfeng vào vendor/ (kèm commit + sha256) — trang đo dùng ĐÚNG chuanHoa / hinhHoc / tomTat / matBangSVG
// của máy vẽ để lời lỗi trong gói `gui` trùng chữ với lời máy vẽ tự soát, và điện thoại vẽ mặt bằng y như thẻ Phòng.
// Dùng: node scripts/lay-mncf-phong.js /đường/dẫn/mn-chenfeng
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const kho = process.argv[2];
if (!kho) { console.error('Dùng: node scripts/lay-mncf-phong.js <đường dẫn kho mn-chenfeng>'); process.exit(2); }
const nguon = path.join(kho, 'src', 'mncf-phong.js');
const buf = fs.readFileSync(nguon);
let commit = '', ban = '';
try { commit = execFileSync('git', ['-C', kho, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { commit = ''; }
try { ban = (/VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(kho, 'src', 'mncf-core.js'), 'utf8')) || [])[1] || ''; } catch (e) { ban = ''; }
const dich = path.join(__dirname, '..', 'vendor');
fs.writeFileSync(path.join(dich, 'mncf-phong.js'), buf);
const tt = { tep: 'src/mncf-phong.js', kho: 'mn-chenfeng', ban_tien_ich: ban, commit, sha256: crypto.createHash('sha256').update(buf).digest('hex'), lay_luc: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(dich, 'mncf-phong.nguon.json'), JSON.stringify(tt, null, 2) + '\n');
console.log(JSON.stringify(tt));
