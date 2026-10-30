/**
 * 도면 라이브러리 정리 (Google Apps Script)
 *
 * "도면" 공유 폴더 아래 모든 현장 폴더를 돌면서 PNG·JPG·SKP 파일을
 * "도면 라이브러리" 폴더의 종류별 하위 폴더로 복사한다. 원본은 건드리지 않는다.
 * 이미 복사한 파일은 다시 복사하지 않으므로 몇 번을 돌려도 안전하다.
 *
 * 처음 한 번: setup() 실행 → 권한 허용. (전체 복사 + 매주 월요일 자동 실행 등록)
 * 이후: 매주 월요일 새벽에 새로 생긴 파일만 자동 복사된다.
 */

const ROOT_FOLDER_ID = '1J_OReAViTTG9e34KZJEEEO-po3KOiGGU'; // "도면"
const LIBRARY_NAME = '도면 라이브러리';
const LOG_NAME = '도면 라이브러리 목록';
const INCLUDE_SKB = false; // .skb는 스케치업 자동 백업본이라 기본 제외
const TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script 1회 실행 한도(6분)보다 여유 있게

// 위에서부터 먼저 맞는 규칙으로 분류한다.
const RULES = [
  ['견적서 캡처', /견적|^\d+월 ?\d+일|\d{3}\.(png|jpe?g)$|^\d{4},/i],
  ['상판·대리석', /대리석|상판|싯기/],
  ['붙박이장', /붙박이|옷장|드레스|장롱|안방|작은방/],
  ['싱크', /싱크|개수대|상부장|하부장|아일랜드|키큰장|주방|냉장고/],
  ['수납장·기타장', /장\d*\.|장 |수납|서랍|신발|파우더|락커|오픈|문갑|벤치|TV|쓰레기|선반|테이블|카운터|제빙|메탈|사무실|탈의실|회의실|욕실|화장실|화장대|편의점|창고/i],
];
const UNSORTED = '미분류';
const CATEGORIES = RULES.map(r => r[0]).concat([UNSORTED]);

function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'run')
    .forEach(t => ScriptApp.deleteTrigger(t));
  const weekly = ScriptApp.newTrigger('run').timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  PropertiesService.getScriptProperties().setProperty('weeklyTriggerId', weekly.getUniqueId());
  run();
}

function run() {
  const started = Date.now();
  clearContinueTriggers_();

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const library = getOrCreateFolder_(root, LIBRARY_NAME);
  const targets = {};
  CATEGORIES.forEach(c => { targets[c] = getOrCreateFolder_(library, c); });
  const log = getOrCreateLog_(library);
  const done = copiedSourceIds_(log);
  // 복사 직후 실행이 끊기면 목록에 안 남으므로, 복사본 설명(src:)도 함께 본다.
  Object.values(targets).forEach(folder => {
    const it = folder.getFiles();
    while (it.hasNext()) {
      const m = (it.next().getDescription() || '').match(/^src:(.+)$/);
      if (m) done.add(m[1]);
    }
  });

  let copied = 0;
  const finished = walk_(root, [], library.getId(), (folderPath, files) => {
    // 같은 폴더의 그림 이름으로 SKP의 종류를 정한다 (SKP 이름은 대부분 "도면.skp").
    const imageCats = files.filter(f => isImage_(f)).map(f => classify_(f.getName()))
      .filter(c => c !== UNSORTED && c !== '견적서 캡처');
    for (const f of files) {
      if (Date.now() - started > TIME_LIMIT_MS) return false;
      if (done.has(f.getId())) continue;
      const ext = ext_(f.getName());
      let cat;
      if (isImage_(f)) cat = classify_(f.getName());
      else if (ext === 'skp' || (INCLUDE_SKB && ext === 'skb')) cat = mostCommon_(imageCats) || classify_(f.getName());
      else continue;

      const name = copyName_(f, folderPath);
      const copy = f.makeCopy(name, targets[cat]);
      copy.setDescription('src:' + f.getId());
      log.appendRow([new Date(), cat, folderPath.join(' / '), f.getName(), name, copy.getUrl(), f.getId()]);
      done.add(f.getId());
      copied++;
    }
    return true;
  });

  if (!finished) {
    // 시간이 모자라면 1분 뒤 이어서 실행한다.
    ScriptApp.newTrigger('run').timeBased().after(60 * 1000).create();
  }
  console.log(`복사 ${copied}개, ${finished ? '완료' : '이어서 실행 예약'}`);
}

function walk_(folder, path, skipId, visit) {
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  if (!visit(path, files)) return false;
  const sub = folder.getFolders();
  while (sub.hasNext()) {
    const child = sub.next();
    if (child.getId() === skipId) continue;
    if (!walk_(child, path.concat([child.getName()]), skipId, visit)) return false;
  }
  return true;
}

function classify_(name) {
  for (const [cat, re] of RULES) if (re.test(name)) return cat;
  return UNSORTED;
}

function isImage_(f) {
  return ['png', 'jpg', 'jpeg'].includes(ext_(f.getName()));
}

function ext_(name) {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function mostCommon_(list) {
  const n = {};
  list.forEach(x => { n[x] = (n[x] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
}

// 예: "26-10-26 해파랑컴퍼니_명지국제8로 258 - 싱크.png"
function copyName_(f, folderPath) {
  const d = Utilities.formatDate(f.getDateCreated(), 'Asia/Seoul', 'yy-MM-dd');
  const site = folderPath.length ? folderPath.join('_') : '도면';
  return `${d} ${site} - ${f.getName()}`;
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getOrCreateLog_(library) {
  const it = library.getFilesByName(LOG_NAME);
  if (it.hasNext()) return SpreadsheetApp.open(it.next()).getSheets()[0];
  const ss = SpreadsheetApp.create(LOG_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(library);
  const sheet = ss.getSheets()[0];
  sheet.appendRow(['복사한 때', '분류', '원래 폴더', '원래 이름', '복사본 이름', '복사본 링크', '원본 ID']);
  sheet.setFrozenRows(1);
  return sheet;
}

function copiedSourceIds_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return new Set();
  return new Set(sheet.getRange(2, 7, last - 1, 1).getValues().map(r => r[0]));
}

function clearContinueTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'run' && t.getEventType() === ScriptApp.EventType.CLOCK
      && !isWeekly_(t))
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function isWeekly_(t) {
  // 주간 트리거는 setup()에서 하나만 만든다. 그 ID를 저장해 두고 구분한다.
  return PropertiesService.getScriptProperties().getProperty('weeklyTriggerId') === t.getUniqueId();
}
