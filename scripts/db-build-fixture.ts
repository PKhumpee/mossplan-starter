// Regenerates fixtures/content-snapshot.sample.json (CONTRACTS §6). Deterministic: same input, same output.
// All people are invented and fictional. Run: `tsx scripts/db-build-fixture.ts`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  SnapshotSchema,
  TiptapDocSchema,
  type Snapshot,
  type TiptapNode,
} from '../src/shared/snapshot';

const out = resolve(import.meta.dirname, '../fixtures/content-snapshot.sample.json');
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 9, 10, 3, 0, 0); // newest article, 10 Oct 2026 10:00 Bangkok

const categories: Snapshot['categories'] = [
  {
    id: 'cat-technology',
    slug: 'technology',
    name: 'เทคโนโลยี',
    sortOrder: 1,
    description:
      'หมวดเทคโนโลยีรวบรวมบทความที่อธิบายเรื่องอุปกรณ์ดิจิทัลและบริการออนไลน์ด้วยภาษาที่เข้าใจง่าย ตั้งแต่การใช้สมาร์ตโฟนให้คุ้มค่า การสำรองข้อมูลอย่างปลอดภัย การตั้งรหัสผ่านและยืนยันตัวตนสองขั้นตอน ไปจนถึงการใช้ปัญญาประดิษฐ์ช่วยทำงานอย่างมีวิจารณญาณ เราเขียนจากประสบการณ์ใช้งานจริง ทดลองก่อนแนะนำ และบอกข้อจำกัดของแต่ละวิธีตรง ๆ เพื่อให้ผู้อ่านตัดสินใจได้เอง ไม่ว่าคุณจะเป็นมือใหม่ที่เพิ่งเริ่มใช้คอมพิวเตอร์ หรือคนทำงานที่อยากจัดระเบียบเครื่องมือประจำวัน ที่นี่มีขั้นตอนที่ทำตามได้ทันที พร้อมเหตุผลว่าทำไมแต่ละขั้นตอนจึงสำคัญ และเมื่อมีข่าวหรือการเปลี่ยนแปลงที่กระทบผู้ใช้ทั่วไป เราจะอัปเดตบทความและระบุวันที่แก้ไขไว้ชัดเจน',
  },
  {
    id: 'cat-lifestyle',
    slug: 'lifestyle',
    name: 'ไลฟ์สไตล์',
    sortOrder: 2,
    description: 'เรื่องราวชีวิตประจำวัน สุขภาพ บ้าน อาหาร และการท่องเที่ยวที่ทำได้จริง',
  },
  {
    id: 'cat-finance',
    slug: 'personal-finance',
    name: 'การเงินส่วนบุคคล',
    sortOrder: 3,
    description: null,
  },
];

const tags: Snapshot['tags'] = [
  { id: 'tag-security', slug: 'security', name: 'ความปลอดภัย' },
  { id: 'tag-ai', slug: 'ai', name: 'ปัญญาประดิษฐ์' },
  { id: 'tag-gadgets', slug: 'gadgets', name: 'อุปกรณ์' },
  { id: 'tag-health', slug: 'health', name: 'สุขภาพ' },
  { id: 'tag-home', slug: 'home', name: 'บ้านและครัว' },
  { id: 'tag-travel', slug: 'travel', name: 'ท่องเที่ยว' },
  { id: 'tag-saving', slug: 'saving', name: 'การออม' },
  { id: 'tag-investing', slug: 'investing', name: 'การลงทุน' },
];

const media: Snapshot['media'] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    id: `media-cover-${n}`,
    key: `fixtures/cover-${n}.jpg`,
    mime: 'image/jpeg',
    width: 1600,
    height: 900,
    alt: [
      'โต๊ะทำงานพร้อมโน้ตบุ๊ก',
      'ทางเดินในสวนยามเช้า',
      'ห้องครัวเล็กที่จัดเรียบร้อย',
      'สมุดบัญชีและเครื่องคิดเลข',
      'ไฟเมืองยามค่ำคืน',
      'ต้นไม้เล็กบนระเบียง',
    ][n - 1]!,
  })),
  {
    id: 'media-avatar-1',
    key: 'fixtures/avatar-1.jpg',
    mime: 'image/jpeg',
    width: 400,
    height: 400,
    alt: 'ณัฐวุฒิ แสงทอง',
  },
  {
    id: 'media-avatar-2',
    key: 'fixtures/avatar-2.jpg',
    mime: 'image/jpeg',
    width: 400,
    height: 400,
    alt: 'พิมพ์ลดา วงศ์สว่าง',
  },
];

const authors: Snapshot['authors'] = [
  {
    id: 'user-nattawut',
    slug: 'nattawut-saengthong',
    name: 'ณัฐวุฒิ แสงทอง',
    jobTitle: 'บรรณาธิการข่าวเทคโนโลยี',
    bio: 'ณัฐวุฒิเขียนเรื่องเทคโนโลยีสำหรับคนทั่วไปมากว่าสิบปี เริ่มจากงานซ่อมคอมพิวเตอร์ก่อนย้ายมาทำงานข่าวและบทความแนะนำ เขาชอบอธิบายเรื่องซับซ้อนให้เหลือขั้นตอนสั้น ๆ ที่ทำตามได้ และมักทดลองทุกวิธีด้วยตัวเองก่อนเขียน บทความทุกชิ้นของเขาระบุข้อจำกัดไว้เสมอ ในเวลาว่างเขาเดินป่าและถ่ายภาพ',
    avatarMediaId: 'media-avatar-1',
    sameAs: ['https://www.example.com/nattawut', 'https://www.linkedin.com/in/example-nattawut'],
    knowsAbout: ['ความปลอดภัยทางไซเบอร์', 'สมาร์ตโฟน', 'ปัญญาประดิษฐ์'],
  },
  {
    id: 'user-pimlada',
    slug: 'pimlada-wongsawang',
    name: 'พิมพ์ลดา วงศ์สว่าง',
    jobTitle: 'นักเขียนไลฟ์สไตล์และการเงินส่วนบุคคล',
    bio: 'พิมพ์ลดาเคยทำงานวางแผนการเงินในสถาบันการเงินก่อนผันตัวมาเป็นนักเขียนอิสระ เธอสนใจเรื่องการใช้ชีวิตเรียบง่าย การออม และสุขภาพที่ดูแลได้ด้วยนิสัยเล็ก ๆ ทุกวัน เธอตรวจสอบตัวเลขและแหล่งอ้างอิงทุกครั้งก่อนเผยแพร่ และไม่เขียนคำแนะนำการลงทุนเฉพาะบุคคล นอกงานเขียนเธอชอบทำอาหารและปลูกผักบนระเบียงบ้าน',
    avatarMediaId: 'media-avatar-2',
    sameAs: ['https://www.example.com/pimlada'],
    knowsAbout: ['การวางแผนการเงิน', 'การออม', 'สุขภาพ', 'การทำอาหาร'],
  },
];

type CatKey = 'cat-technology' | 'cat-lifestyle' | 'cat-finance';

const pools: Record<CatKey, string[]> = {
  'cat-technology': [
    'ทุกวันนี้เราพึ่งพาสมาร์ตโฟนในแทบทุกเรื่อง ตั้งแต่ตื่นนอนจนถึงเข้านอน การเข้าใจว่าเครื่องทำงานอย่างไรจึงช่วยให้เราเลือกใช้ได้คุ้มค่าและปลอดภัยมากขึ้น',
    'การสำรองข้อมูลเป็นนิสัยที่ดูเหมือนเรื่องเล็ก แต่เมื่อเครื่องหายหรือเสียกะทันหัน ภาพถ่ายและเอกสารสำคัญที่มีอยู่เพียงชุดเดียวอาจกู้คืนไม่ได้อีกเลย',
    'รหัสผ่านที่ยาวและไม่ซ้ำกันในแต่ละบริการปลอดภัยกว่ารหัสสั้นที่จำง่าย ตัวจัดการรหัสผ่านช่วยให้เราไม่ต้องจำทั้งหมดด้วยตัวเอง',
    'เครือข่าย Wi-Fi ที่บ้านมักถูกวางไว้ผิดตำแหน่ง ทำให้สัญญาณอ่อนในห้องที่ใช้งานบ่อย การย้ายเราเตอร์มาไว้กลางบ้านและให้พ้นจากสิ่งกีดขวางช่วยได้มากกว่าที่คิด',
    'ปัญญาประดิษฐ์ช่วยร่างข้อความและสรุปเอกสารได้รวดเร็ว แต่ผู้ใช้ยังต้องตรวจสอบข้อเท็จจริงทุกครั้งก่อนนำไปใช้ต่อ',
    'แบตเตอรี่ลิเทียมไอออนเสื่อมตามจำนวนรอบการชาร์จและอุณหภูมิ การหลีกเลี่ยงความร้อนจัดและไม่ปล่อยให้แบตหมดเกลี้ยงบ่อย ๆ ช่วยยืดอายุการใช้งานได้',
    'ก่อนอัปเดตระบบปฏิบัติการ ควรอ่านรายละเอียดของการอัปเดตสั้น ๆ และตรวจสอบว่าพื้นที่เก็บข้อมูลเพียงพอ เพื่อลดโอกาสที่เครื่องจะค้างระหว่างติดตั้ง',
    'อีเมลหลอกลวงมักสร้างความเร่งรีบ เช่น แจ้งว่าบัญชีจะถูกระงับภายในไม่กี่ชั่วโมง หากรู้สึกว่าถูกเร่ง ให้หยุดและเข้าสู่ระบบผ่านแอปทางการแทนการกดลิงก์',
  ],
  'cat-lifestyle': [
    'การนอนหลับเพียงพอเป็นรากฐานของสุขภาพที่ดี ผู้ใหญ่ส่วนใหญ่ต้องการราว 7 ถึง 9 ชั่วโมงต่อคืน และการเข้านอนเป็นเวลาสม่ำเสมอช่วยให้หลับลึกขึ้น',
    'การเดินวันละสามสิบนาทีไม่ต้องใช้อุปกรณ์พิเศษ แต่ช่วยให้หัวใจแข็งแรงและอารมณ์ดีขึ้น เริ่มจากเดินรอบหมู่บ้านหลังมื้อเย็นก็เพียงพอสำหรับคนที่ไม่เคยออกกำลังกาย',
    'ห้องครัวเล็ก ๆ ก็ทำอาหารอร่อยได้ หากวางแผนเมนูล่วงหน้าและเตรียมวัตถุดิบพื้นฐานไว้ เช่น ไข่ ข้าว ผักสด และเครื่องปรุงที่ใช้บ่อย',
    'การจัดบ้านให้โล่งไม่ได้หมายถึงการทิ้งของทั้งหมด แต่คือการเก็บเฉพาะสิ่งที่ใช้จริงและให้ทุกอย่างมีที่อยู่ชัดเจน เพื่อให้หาง่ายและทำความสะอาดสะดวก',
    'การเดินทางท่องเที่ยวในประเทศช่วงนอกฤดูกาลมีข้อดีหลายอย่าง ทั้งราคาที่พักถูกลง คนน้อยลง และได้เห็นบรรยากาศอีกแบบของสถานที่คุ้นเคย',
    'การดื่มน้ำให้เพียงพอตลอดวันช่วยให้ร่างกายทำงานได้ดี ลองวางขวดน้ำไว้ใกล้มือ เพื่อให้จิบได้บ่อยโดยไม่ต้องคอยเตือนตัวเอง',
    'งานอดิเรกช่วยให้ใจได้พักจากเรื่องงาน ไม่ว่าจะเป็นปลูกต้นไม้ ถ่ายภาพ หรือประดิษฐ์ของเล็ก ๆ สิ่งสำคัญคือทำเพราะสนุก ไม่ใช่เพราะต้องเก่ง',
    'การใช้เวลากับครอบครัวโดยไม่มีโทรศัพท์บนโต๊ะอาหารอาจฟังดูเรียบง่าย แต่ช่วยให้บทสนทนาลึกขึ้นและทุกคนรู้สึกว่าได้รับความสนใจ',
  ],
  'cat-finance': [
    'การออมเงินให้ได้อย่างน้อยร้อยละสิบของรายได้ทุกเดือนเป็นเป้าหมายที่หลายคนตั้งไว้ วิธีที่ง่ายที่สุดคือโอนเงินออมทันทีที่เงินเดือนเข้า แล้วค่อยใช้ส่วนที่เหลือ',
    'เงินสำรองฉุกเฉินควรครอบคลุมค่าใช้จ่ายอย่างน้อยสามถึงหกเดือน และเก็บไว้ในบัญชีที่ถอนได้ทันที เพื่อรับมือเหตุไม่คาดฝัน เช่น ตกงานหรือเจ็บป่วย',
    'ก่อนลงทุนในสินทรัพย์ใด ควรเข้าใจก่อนว่าผลตอบแทนที่สูงมักมาพร้อมความเสี่ยงที่สูง และไม่มีใครรับประกันกำไรได้ล่วงหน้า บทความนี้เป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำการลงทุนส่วนบุคคล',
    'การจดรายรับรายจ่ายเพียงสองสามเดือนทำให้เห็นรูปแบบการใช้เงินที่แท้จริง หลายคนแปลกใจที่ค่าใช้จ่ายเล็ก ๆ ประจำวันรวมกันแล้วมากกว่าที่คาดไว้',
    'ดอกเบี้ยบัตรเครดิตสูงกว่าดอกเบี้ยเงินฝากหลายเท่า การจ่ายเต็มจำนวนทุกเดือนจึงเป็นวิธีที่ดีที่สุดในการใช้บัตรโดยไม่เสียต้นทุนเพิ่ม',
    'ประกันสุขภาพช่วยลดความเสี่ยงที่ค่ารักษาพยาบาลก้อนใหญ่จะทำลายแผนการเงินทั้งหมด ควรเปรียบเทียบความคุ้มครอง ข้อยกเว้น และระยะเวลารอคอยก่อนตัดสินใจ',
    'การวางแผนเกษียณยิ่งเริ่มเร็วยิ่งได้เปรียบ เพราะผลของดอกเบี้ยทบต้นต้องใช้เวลา แม้เริ่มจากจำนวนเล็กน้อยก็สะสมได้มากเมื่อเวลาผ่านไปหลายสิบปี',
    'ก่อนซื้อของชิ้นใหญ่ ลองรอสามสิบวันเพื่อดูว่ายังอยากได้อยู่หรือไม่ วิธีนี้ช่วยลดการซื้อตามอารมณ์ได้อย่างเห็นผล',
  ],
};

const bullets: Record<CatKey, string[]> = {
  'cat-technology': ['ตรวจสอบก่อนทำทุกครั้ง', 'ทำทีละขั้นตอน', 'จดสิ่งที่เปลี่ยนไว้เผื่อย้อนกลับ'],
  'cat-lifestyle': ['เริ่มจากสิ่งเล็ก ๆ', 'ทำให้เป็นกิจวัตร', 'ไม่เปรียบเทียบกับคนอื่น'],
  'cat-finance': ['ตั้งเป้าหมายที่ชัดเจน', 'ทบทวนทุกเดือน', 'ปรับตามรายได้ที่เปลี่ยนไป'],
};

// [slug, title, excerpt, category, tag ids]
type Row = [string, string, string, CatKey, string[]];
const rows: Row[] = [
  [
    'backup-smartphone-data',
    'วิธีสำรองข้อมูลในสมาร์ตโฟนให้ปลอดภัยแบบไม่ยุ่งยาก',
    'สำรองรูปและเอกสารสำคัญได้ในสิบนาที พร้อมวิธีตั้งให้ทำงานอัตโนมัติ',
    'cat-technology',
    ['tag-security', 'tag-gadgets'],
  ],
  [
    'strong-passwords',
    'ตั้งรหัสผ่านอย่างไรให้แข็งแรงและจำได้จริง',
    'หลักการตั้งรหัสผ่านที่ยาว ไม่ซ้ำ และจัดการได้ง่าย',
    'cat-technology',
    ['tag-security'],
  ],
  [
    'improve-home-wifi',
    'ปรับ Wi-Fi ที่บ้านให้เร็วขึ้นโดยไม่ต้องซื้อเราเตอร์ใหม่',
    'ย้ายตำแหน่ง เปลี่ยนช่องสัญญาณ และตรวจอุปกรณ์ที่แย่งแบนด์วิดท์',
    'cat-technology',
    ['tag-gadgets', 'tag-home'],
  ],
  [
    'use-ai-at-work',
    'ใช้ AI ช่วยทำงานอย่างไรให้ได้ผลและไม่พลาด',
    'ตัวอย่างงานที่ AI ช่วยได้ดี และจุดที่ต้องตรวจซ้ำทุกครั้ง',
    'cat-technology',
    ['tag-ai'],
  ],
  [
    'phone-battery-care',
    'ยืดอายุแบตเตอรี่โทรศัพท์ด้วยนิสัยง่าย ๆ ห้าข้อ',
    'ความร้อนและการชาร์จจนเกลี้ยงคือศัตรูหลักของแบตเตอรี่',
    'cat-technology',
    ['tag-gadgets'],
  ],
  [
    'spot-phishing-emails',
    'รู้ทันอีเมลหลอกลวงก่อนกดลิงก์',
    'สัญญาณเตือนห้าอย่างที่บอกว่าอีเมลฉบับนี้ไม่น่าไว้ใจ',
    'cat-technology',
    ['tag-security'],
  ],
  [
    'safe-system-update',
    'อัปเดตระบบอย่างไรไม่ให้เครื่องค้าง',
    'เตรียมพื้นที่ สำรองข้อมูล และเลือกเวลาที่เหมาะก่อนอัปเดต',
    'cat-technology',
    ['tag-gadgets', 'tag-security'],
  ],
  [
    'choose-backup-drive',
    'เลือกซื้อฮาร์ดดิสก์สำรองข้อมูลให้เหมาะกับการใช้งาน',
    'เปรียบเทียบฮาร์ดดิสก์ เอสเอสดี และบริการคลาวด์ตามลักษณะข้อมูลของคุณ',
    'cat-technology',
    ['tag-gadgets'],
  ],
  [
    'two-factor-authentication',
    'ทำความรู้จักการยืนยันตัวตนสองขั้นตอน',
    'ทำไมรหัสผ่านอย่างเดียวจึงไม่พอ และเปิดใช้งานอย่างไร',
    'cat-technology',
    ['tag-security'],
  ],
  [
    'organize-computer-files',
    'จัดระเบียบไฟล์ในคอมพิวเตอร์ให้ค้นหาง่าย',
    'โครงสร้างโฟลเดอร์และการตั้งชื่อไฟล์ที่ใช้ได้นานหลายปี',
    'cat-technology',
    ['tag-home'],
  ],
  [
    'better-sleep-shift-workers',
    'เคล็ดลับนอนหลับลึกสำหรับคนทำงานเข้ากะ',
    'จัดห้อง แสง และเวลาพักให้ร่างกายปรับตัวได้ง่ายขึ้น',
    'cat-lifestyle',
    ['tag-health'],
  ],
  [
    'daily-walking-habit',
    'เดินวันละครึ่งชั่วโมง เริ่มต้นอย่างไรให้ไม่ท้อ',
    'แผนสี่สัปดาห์สำหรับคนที่ไม่เคยออกกำลังกายมาก่อน',
    'cat-lifestyle',
    ['tag-health'],
  ],
  [
    'small-kitchen-meals',
    'เมนูง่ายสำหรับห้องครัวเล็ก',
    'วัตถุดิบพื้นฐานไม่กี่อย่างที่ทำอาหารได้หลายมื้อ',
    'cat-lifestyle',
    ['tag-home'],
  ],
  [
    'declutter-home',
    'จัดบ้านให้โล่งโดยไม่ต้องทิ้งทุกอย่าง',
    'หลักคิดการจัดบ้านที่เก็บของจำเป็นไว้และตัดความรกออก',
    'cat-lifestyle',
    ['tag-home'],
  ],
  [
    'off-season-thai-travel',
    'เที่ยวไทยนอกฤดูกาล คุ้มกว่าที่คิด',
    'ข้อดี ข้อควรระวัง และการเตรียมตัวสำหรับการเที่ยวช่วงคนน้อย',
    'cat-lifestyle',
    ['tag-travel'],
  ],
  [
    'drink-enough-water',
    'ดื่มน้ำให้พอในแต่ละวันด้วยวิธีเล็ก ๆ',
    'นิสัยง่าย ๆ ที่ช่วยให้ดื่มน้ำสม่ำเสมอโดยไม่ต้องฝืน',
    'cat-lifestyle',
    ['tag-health'],
  ],
  [
    'relaxing-hobbies',
    'งานอดิเรกที่ช่วยให้ใจได้พัก',
    'เลือกงานอดิเรกที่เหมาะกับเวลาและงบประมาณของคุณ',
    'cat-lifestyle',
    ['tag-health', 'tag-home'],
  ],
  [
    'phone-free-dinner',
    'มื้อเย็นไร้โทรศัพท์ของครอบครัว',
    'กติกาเรียบง่ายที่ทำให้มื้อเย็นกลับมาเป็นเวลาคุยกัน',
    'cat-lifestyle',
    ['tag-home'],
  ],
  [
    'balcony-vegetable-garden',
    'เริ่มปลูกผักในระเบียงคอนโด',
    'ผักโตเร็วห้าชนิดที่เหมาะกับพื้นที่เล็กและแดดรำไร',
    'cat-lifestyle',
    ['tag-home', 'tag-health'],
  ],
  [
    'weekly-schedule-rest',
    'จัดตารางสัปดาห์ให้มีเวลาพักจริง',
    'วางเวลาพักไว้ในตารางก่อนงานอื่น แล้วรักษาให้ได้',
    'cat-lifestyle',
    ['tag-health'],
  ],
  [
    'save-ten-percent',
    'ออมเงินเดือนละสิบเปอร์เซ็นต์ทำได้อย่างไร',
    'วิธีโอนเงินออมก่อนใช้จ่ายและปรับงบเมื่อรายได้ไม่แน่นอน',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'emergency-fund',
    'เงินสำรองฉุกเฉินควรมีเท่าไรและเก็บที่ไหน',
    'คำนวณจากค่าใช้จ่ายจริง และเลือกที่เก็บที่ถอนได้ทันที',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'before-first-investment',
    'ก่อนลงทุนครั้งแรก ควรรู้อะไรบ้าง',
    'เข้าใจความเสี่ยง เป้าหมาย และระยะเวลาลงทุนก่อนซื้อสินทรัพย์ใด ๆ',
    'cat-finance',
    ['tag-investing'],
  ],
  [
    'track-spending-three-months',
    'จดรายรับรายจ่ายสามเดือนแล้วเห็นอะไร',
    'ผลจากการจดบันทึกจริงและวิธีเริ่มต้นแบบไม่ยุ่งยาก',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'credit-card-no-interest',
    'ใช้บัตรเครดิตอย่างไรไม่ให้เสียดอกเบี้ย',
    'เข้าใจรอบบิลและวันครบกำหนด เพื่อใช้บัตรโดยไม่มีต้นทุนแฝง',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'compare-health-insurance',
    'ประกันสุขภาพ เปรียบเทียบอย่างไรให้คุ้ม',
    'ดูความคุ้มครอง ข้อยกเว้น และเงื่อนไขก่อนตัดสินใจซื้อ',
    'cat-finance',
    ['tag-health'],
  ],
  [
    'retirement-from-thirty',
    'วางแผนเกษียณตั้งแต่อายุสามสิบ',
    'พลังของดอกเบี้ยทบต้นและวิธีเริ่มจากเงินจำนวนน้อย',
    'cat-finance',
    ['tag-saving', 'tag-investing'],
  ],
  [
    'thirty-day-rule',
    'กฎสามสิบวันก่อนซื้อของชิ้นใหญ่',
    'เทคนิคง่าย ๆ ที่ลดการซื้อตามอารมณ์',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'separate-savings-account',
    'แยกบัญชีเงินออมและเงินใช้จ่ายให้ชัดเจน',
    'ระบบสองถึงสามบัญชีที่ช่วยให้เห็นเงินออมโดยไม่ต้องคำนวณ',
    'cat-finance',
    ['tag-saving'],
  ],
  [
    'read-loan-contract',
    'อ่านสัญญาเงินกู้ให้เข้าใจก่อนเซ็น',
    'ข้อความที่ต้องอ่านให้ละเอียดก่อนเซ็นสัญญา: ดอกเบี้ย ค่าธรรมเนียม และการผิดนัด',
    'cat-finance',
    ['tag-saving'],
  ],
];

const p = (text: string): TiptapNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (level: number, text: string): TiptapNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

function body(i: number, cat: CatKey, coverless: boolean): TiptapNode {
  const pool = pools[cat];
  const n = 2 + ((i * 3) % 7); // 2..8 blocks of text
  const content: TiptapNode[] = [];
  for (let k = 0; k < n; k++) {
    if (k === 2) content.push(h(2, 'ประเด็นที่ควรรู้'));
    if (k === 5) content.push(h(3, 'ข้อควรระวัง'));
    content.push(p(pool[(i + k) % pool.length]!));
    if (k === 1 && i % 2 === 0) {
      content.push({
        type: 'bulletList',
        content: bullets[cat].map((t) => ({ type: 'listItem', content: [p(t)] })),
      });
    }
  }
  if (!coverless && i % 5 === 0) {
    content.push({
      type: 'image',
      attrs: { mediaId: 'media-cover-2', alt: 'ภาพประกอบเนื้อหา', caption: 'ภาพประกอบ' },
    });
  }
  return { type: 'doc', content };
}

/** One article that uses every allowed node and mark at least once. */
function showcase(): TiptapNode {
  const t = (text: string, marks?: TiptapNode['marks']): TiptapNode => ({
    type: 'text',
    text,
    ...(marks ? { marks } : {}),
  });
  return {
    type: 'doc',
    content: [
      p(
        'ตัวแก้ไขของเราจัดรูปแบบข้อความได้ครบตามที่เว็บไซต์รองรับ บทความนี้ใช้ทุกรูปแบบเพื่อทดสอบการแสดงผล',
      ),
      h(2, 'การจัดรูปแบบข้อความ'),
      {
        type: 'paragraph',
        content: [
          t('ข้อความ'),
          t('ตัวหนา', [{ type: 'bold' }]),
          t(' '),
          t('ตัวเอียง', [{ type: 'italic' }]),
          t(' '),
          t('ขีดเส้นใต้', [{ type: 'underline' }]),
          t(' '),
          t('ขีดฆ่า', [{ type: 'strike' }]),
          t(' และโค้ด '),
          t('npm install', [{ type: 'code' }]),
          t(' รวมถึงลิงก์ไปยัง '),
          t('เว็บไซต์ตัวอย่าง', [{ type: 'link', attrs: { href: 'https://www.example.com/' } }]),
        ],
      },
      h(3, 'รายการ'),
      {
        type: 'bulletList',
        content: ['รายการที่หนึ่ง', 'รายการที่สอง'].map((x) => ({
          type: 'listItem',
          content: [p(x)],
        })),
      },
      {
        type: 'orderedList',
        content: ['ขั้นตอนแรก', 'ขั้นตอนที่สอง', 'ขั้นตอนสุดท้าย'].map((x) => ({
          type: 'listItem',
          content: [p(x)],
        })),
      },
      h(4, 'คำพูดและโค้ด'),
      { type: 'blockquote', content: [p('ข้อมูลที่ดีเริ่มจากการตั้งคำถามที่ถูกต้อง')] },
      {
        type: 'codeBlock',
        attrs: { language: 'bash' },
        content: [{ type: 'text', text: 'pnpm install\npnpm build' }],
      },
      {
        type: 'paragraph',
        content: [t('บรรทัดแรก'), { type: 'hardBreak' }, t('บรรทัดที่สองในย่อหน้าเดียวกัน')],
      },
      { type: 'horizontalRule' },
      {
        type: 'image',
        attrs: {
          mediaId: 'media-cover-3',
          alt: 'ห้องครัวเล็กที่จัดเรียบร้อย',
          caption: 'ภาพประกอบพร้อมคำบรรยาย',
        },
      },
      { type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ' } },
      p('ทั้งหมดนี้คือรูปแบบที่ตัวแก้ไขและหน้าเว็บรองรับ'),
    ],
  };
}

const articles: Snapshot['articles'] = [];
const all: {
  slug: string;
  title: string;
  excerpt: string;
  cat: CatKey;
  tags: string[];
  content: TiptapNode;
}[] = rows.map(([slug, title, excerpt, cat, tg], i) => ({
  slug,
  title,
  excerpt,
  cat,
  tags: tg,
  content: body(i, cat, i % 3 === 1),
}));
all.splice(2, 0, {
  slug: 'editor-showcase',
  title: 'คู่มือการจัดรูปแบบบทความด้วยตัวแก้ไขของเรา',
  excerpt: 'รวมทุกรูปแบบที่ตัวแก้ไขรองรับ ตั้งแต่หัวข้อ รายการ คำพูด โค้ด ไปจนถึงรูปภาพและวิดีโอ',
  cat: 'cat-technology',
  tags: ['tag-gadgets'],
  content: showcase(),
});

all.forEach((a, i) => {
  const publishedAt = BASE - i * 2 * DAY;
  const author = a.cat === 'cat-technology' ? authors[0]! : authors[1]!;
  const other = author === authors[0] ? authors[1]! : authors[0]!;
  const reviewed = i % 3 === 0;
  articles.push({
    id: `art-${String(i + 1).padStart(3, '0')}`,
    slug: a.slug,
    lang: 'th',
    translationGroupId: null,
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    coverMediaId: i % 3 === 1 ? null : `media-cover-${(i % 6) + 1}`,
    categoryId: a.cat,
    tagIds: a.tags,
    authorId: author.id,
    reviewerId: reviewed ? other.id : null,
    reviewedAt: reviewed ? publishedAt + DAY : null,
    publishedAt,
    updatedAt: i % 4 === 1 ? publishedAt + (i + 1) * 3 * DAY : publishedAt,
    seo:
      i % 7 === 0
        ? { title: `${a.title} | คู่มือฉบับย่อ`, description: a.excerpt }
        : { title: null, description: null },
    hasAffiliate: false,
  });
});

const snapshot: Snapshot = {
  version: 2,
  generatedAt: Date.UTC(2026, 9, 15, 3, 0, 0),
  site: {
    name: 'Mossplan',
    description: 'บทความและข่าวสารที่อ่านง่าย เขียนด้วยข้อมูลที่ตรวจสอบได้',
    url: 'https://mossplan.example.workers.dev',
    defaultLang: 'th',
  },
  categories,
  tags,
  media,
  authors,
  articles,
  affiliateLinks: [],
  redirects: [
    { from: '/articles/old-wifi-tips/', to: '/articles/improve-home-wifi/' },
    { from: '/category/tech/', to: '/category/technology/' },
  ],
};

SnapshotSchema.parse(snapshot);
for (const a of snapshot.articles) TiptapDocSchema.parse(a.content);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`[fixture] wrote ${articles.length} articles to ${out}`);
