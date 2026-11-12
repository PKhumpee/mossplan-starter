<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import { BubbleMenu } from '@tiptap/vue-3/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { Mark } from '@tiptap/core';
import { normalizeHeadingsHtml, normalizeHeadingNodes } from '../../../lib/content/headings';
import { api } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import { graphemeLength, thaiWordCount, readingTimeMinutes } from '../../../lib/format/thai';
import { formatThaiDate } from '../../../lib/format/date';
import CategorySelect from '../taxonomy/CategorySelect.vue';
import TagSelect from '../taxonomy/TagSelect.vue';
import MediaPicker, { type PickedMedia } from '../media/MediaPicker.vue';
import Modal from '../ui/Modal.vue';
import Spinner from '../ui/Spinner.vue';
import Badge from '../ui/Badge.vue';
import LinkPasteFlow from '../affiliate/LinkPasteFlow.vue';
import policyConfig from '../../../../config/content-policy.json';

const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration=underline' }];
  },
  renderHTML() {
    return ['u', 0];
  },
});

const Link = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  addAttributes() {
    return {
      href: { default: null },
      nofollow: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: 'a[href]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const relParts = ['noopener'];
    if (HTMLAttributes.nofollow) relParts.push('nofollow');
    return ['a', { ...HTMLAttributes, rel: relParts.join(' ') }, 0];
  },
});

const AffiliateLink = Mark.create({
  name: 'affiliateLink',
  priority: 1000,
  keepOnSplit: false,
  addAttributes() {
    return {
      linkId: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'a[data-aff]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          return {
            linkId: element.getAttribute('data-link-id'),
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      {
        'data-aff': '',
        'data-link-id': HTMLAttributes.linkId,
        rel: 'sponsored nofollow noopener',
      },
      0,
    ];
  },
});

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-media-id') ||
          (element.getAttribute('src')?.startsWith('media:')
            ? element.getAttribute('src')?.slice(6)
            : null),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { 'data-media-id': attributes.mediaId };
        },
      },
      caption: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const mediaId =
      HTMLAttributes['data-media-id'] ||
      HTMLAttributes.mediaId ||
      (typeof HTMLAttributes.src === 'string' && HTMLAttributes.src.startsWith('media:')
        ? HTMLAttributes.src.slice(6)
        : null);

    const displaySrc = mediaId ? `/api/admin/media/${mediaId}/file` : HTMLAttributes.src;
    return [
      'img',
      {
        ...HTMLAttributes,
        src: displaySrc,
      },
    ];
  },
});

interface Props {
  initialId?: string;
  userRole?: 'owner' | 'admin' | 'editor';
}

const props = defineProps<Props>();

// Form state
const articleId = ref<string | null>(props.initialId || null);
const title = ref('');
const slug = ref('');
const excerpt = ref('');
const categoryId = ref<string | null>(null);
const tagIds = ref<string[]>([]);
const coverMediaId = ref<string | null>(null);
const seoTitle = ref('');
const seoDescription = ref('');
const status = ref<'draft' | 'scheduled' | 'published'>('draft');
const publishedAt = ref<number | null>(null);
const authorId = ref<string | null>(null);
const authorName = ref<string>('');
const reviewedBy = ref<string | null>(null);
const reviewedAt = ref<number | null>(null);
const reviewerName = ref<string | null>(null);

const originalSlug = ref('');
const mediaPickerTarget = ref<'cover' | 'body' | null>(null);
const isMediaPickerOpen = computed({
  get: () => mediaPickerTarget.value !== null,
  set: (val: boolean) => {
    if (!val) mediaPickerTarget.value = null;
  },
});
const scheduleModalOpen = ref(false);
const scheduleDate = ref('');
const scheduleTime = ref('09:00');

const saveStatus = ref<'saved' | 'saving' | 'error' | 'unsaved'>(
  props.initialId ? 'saved' : 'unsaved',
);
const saving = ref(false);
const loading = ref(!!props.initialId);
const currentUserId = ref<string>('');
const currentUserProfileComplete = ref<boolean>(false);

// Affiliate and merchant state
interface MerchantItem {
  id: string;
  name: string;
  domain: string;
  trackingHosts: string[];
}

interface AffiliateLinkItem {
  id: string;
  slug: string;
  label: string;
  merchantId: string;
  merchantName?: string;
  status: 'active' | 'paused' | 'broken';
}

const merchantsList = ref<MerchantItem[]>([]);
const activeAffiliateLinks = ref<AffiliateLinkItem[]>([]);
const affiliatePickerOpen = ref(false);
const affiliateSearchQuery = ref('');
const showPasteFlowModal = ref(false);

const totalPublishedArticles = ref(0);
const totalAffiliateArticles = ref(0);
const maxAffiliateArticleShare = ref(0.3);

const allMerchantHosts = computed(() => {
  const hosts = new Set<string>();
  for (const m of merchantsList.value) {
    if (m.domain) hosts.add(m.domain.toLowerCase().trim());
    if (Array.isArray(m.trackingHosts)) {
      for (const th of m.trackingHosts) {
        if (th) hosts.add(th.toLowerCase().trim());
      }
    }
  }
  return hosts;
});

function isMerchantUrl(urlStr: string): boolean {
  if (!urlStr || allMerchantHosts.value.size === 0) return false;
  try {
    let u = urlStr.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      if (u.includes('.')) u = 'https://' + u;
      else return false;
    }
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    for (const mHost of allMerchantHosts.value) {
      const cleanMHost = mHost.replace(/^www\./, '');
      if (host === cleanMHost || host.endsWith('.' + cleanMHost)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

// Reactive tick to ensure Vue computeds react to Tiptap editor changes
const editorTick = ref(0);

// Tiptap Editor
const editor = useEditor({
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  extensions: [
    StarterKit.configure({
      // Headings in body content are strictly levels 2–4 (CONTRACTS §6, DESIGN §9.2).
      // H1 is reserved for the article title.
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    Link,
    AffiliateLink,
    CustomImage.configure({ inline: false }),
    Youtube.configure({ inline: false, width: 640, height: 360 }),
    Placeholder.configure({
      placeholder: 'เริ่มพิมพ์เนื้อหาบทความของคุณที่นี่ หรือเลือกจัดหัวข้อจากแถบเครื่องมือ...',
    }),
  ],
  editorProps: {
    transformPastedHTML: (html: string) => normalizeHeadingsHtml(html),
    attributes: {
      class: 'prose focus:outline-none min-h-[460px] p-2',
    },
  },
  onUpdate: () => {
    editorTick.value++;
    scheduleAutosave();
  },
  onTransaction: () => {
    editorTick.value++;
  },
});

// Dynamic Outline extracted from Tiptap document (DESIGN §9.1, §9.5)
interface OutlineItem {
  id: string;
  text: string;
  level: number;
  index: number;
  skipped: boolean;
  skipMessage: string;
}
const outline = computed<OutlineItem[]>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  editorTick.value;
  if (!editor.value) return [];
  const json = editor.value.getJSON();
  const items: OutlineItem[] = [];
  let headingIndex = 0;
  let prevLevel = 2; // expected root level under article title

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'heading') {
      const text = (node.content ?? []).map((c: any) => c.text ?? '').join('');
      const level = Number(node.attrs?.level) || 2;
      const idx = headingIndex++;

      // Detect skipped heading levels (DESIGN §9.1, §9.5)
      let skipped = false;
      let skipMessage = '';
      if (items.length === 0) {
        if (level > 2) {
          skipped = true;
          skipMessage = `ข้ามจาก H1 ไป H${level}`;
        }
      } else if (level > prevLevel + 1) {
        skipped = true;
        skipMessage = `ข้ามจาก H${prevLevel} ไป H${level}`;
      }
      prevLevel = level;

      items.push({
        id: `heading-${idx}-${text.slice(0, 24)}`,
        text,
        level,
        index: idx,
        skipped,
        skipMessage,
      });
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }
  walk(json);
  return items;
});

const editorText = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  editorTick.value;
  if (!editor.value) return '';
  return editor.value.getText() || '';
});
const totalContentWords = computed(() =>
  thaiWordCount(`${title.value} ${excerpt.value} ${editorText.value}`),
);
const totalReadingMinutes = computed(() =>
  readingTimeMinutes(`${title.value} ${excerpt.value} ${editorText.value}`),
);

// Grapheme counts
const titleGraphemes = computed(() => graphemeLength(title.value));
const excerptGraphemes = computed(() => graphemeLength(excerpt.value));
const excerptWords = computed(() => thaiWordCount(excerpt.value));
const seoTitleGraphemes = computed(() => graphemeLength(seoTitle.value || title.value));
const seoDescGraphemes = computed(() => graphemeLength(seoDescription.value || excerpt.value));

// SERP Preview Tool state & computed (inspired by aqibmunir.com/serp-snippet-preview-tool/)
const serpDevice = ref<'desktop' | 'mobile'>('desktop');
const copyTitleSuccess = ref(false);
const copyDescSuccess = ref(false);

const effectiveSeoTitle = computed(
  () => seoTitle.value.trim() || title.value.trim() || 'ชื่อบทความของคุณ',
);
const effectiveSeoDesc = computed(
  () =>
    seoDescription.value.trim() ||
    excerpt.value.trim() ||
    'คำอธิบายบทความย่อบนผลการค้นหาของ Google จะปรากฏที่นี่ สรุปเนื้อหาสำคัญที่ตอบคำถามของผู้อ่าน...',
);

const titleStatus = computed(() => {
  const count = seoTitleGraphemes.value;
  if (count === 0)
    return { label: 'ยังไม่ระบุ', tone: 'danger', percent: 0, barClass: 'bg-danger' };
  if (count < 30)
    return {
      label: 'สั้นเกินไป',
      tone: 'warning',
      percent: Math.min((count / 60) * 100, 100),
      barClass: 'bg-warning',
    };
  if (count <= 60)
    return {
      label: 'ความยาวเหมาะสม',
      tone: 'success',
      percent: Math.min((count / 60) * 100, 100),
      barClass: 'bg-success',
    };
  if (count <= 70)
    return {
      label: 'ค่อนข้างยาว',
      tone: 'warning',
      percent: 100,
      barClass: 'bg-warning',
    };
  return {
    label: 'ยาวมาก (จะถูกตัด...)',
    tone: 'danger',
    percent: 100,
    barClass: 'bg-danger',
  };
});

const descStatus = computed(() => {
  const count = seoDescGraphemes.value;
  if (count === 0)
    return { label: 'ยังไม่ระบุ', tone: 'danger', percent: 0, barClass: 'bg-danger' };
  if (count < 70)
    return {
      label: 'สั้นเกินไป',
      tone: 'warning',
      percent: Math.min((count / 155) * 100, 100),
      barClass: 'bg-warning',
    };
  if (count <= 155)
    return {
      label: 'ความยาวเหมาะสม',
      tone: 'success',
      percent: Math.min((count / 155) * 100, 100),
      barClass: 'bg-success',
    };
  if (count <= 190)
    return {
      label: 'ค่อนข้างยาว',
      tone: 'warning',
      percent: 100,
      barClass: 'bg-warning',
    };
  return {
    label: 'ยาวมาก (จะถูกตัด...)',
    tone: 'danger',
    percent: 100,
    barClass: 'bg-danger',
  };
});

function copyTitle() {
  if (typeof navigator !== 'undefined') {
    navigator.clipboard.writeText(effectiveSeoTitle.value);
    copyTitleSuccess.value = true;
    setTimeout(() => {
      copyTitleSuccess.value = false;
    }, 2000);
  }
}

function copyDescription() {
  if (typeof navigator !== 'undefined') {
    navigator.clipboard.writeText(effectiveSeoDesc.value);
    copyDescSuccess.value = true;
    setTimeout(() => {
      copyDescSuccess.value = false;
    }, 2000);
  }
}

function syncFromArticle() {
  if (title.value) seoTitle.value = title.value;
  if (excerpt.value) seoDescription.value = excerpt.value;
  toast.success('ดึงข้อมูลจากชื่อเรื่องและบทนำเรียบร้อย');
}

const slugValid = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.value));

// Pre-publish checklist (DESIGN §9.5, AFFILIATE §7)
const checklist = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  editorTick.value;
  const content = normalizeHeadingNodes(editor.value?.getJSON());
  const textContent = JSON.stringify(content || {});

  // Check blocked domains in links
  let hasBlockedDomain = false;
  const blockedList = policyConfig.blockedDomains || [];
  if (blockedList.length > 0) {
    for (const d of blockedList) {
      if (textContent.includes(d)) {
        hasBlockedDomain = true;
        break;
      }
    }
  }

  // Check review terms in text
  let needsReview = false;
  const reviewTerms = policyConfig.reviewTerms || [];
  if (reviewTerms.length > 0) {
    const combined = `${title.value} ${excerpt.value} ${textContent}`.toLowerCase();
    for (const term of reviewTerms) {
      if (combined.includes(term.toLowerCase())) {
        needsReview = true;
        break;
      }
    }
  }

  // Check bare merchant links in plain link marks & detect affiliate links
  let hasBareMerchantLink = false;
  let bareMerchantUrl = '';
  let thisArticleHasAffiliate = false;

  const checkNodes = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      for (const m of node.marks) {
        if (m.type === 'link' && m.attrs?.href) {
          if (isMerchantUrl(m.attrs.href)) {
            hasBareMerchantLink = true;
            bareMerchantUrl = String(m.attrs.href);
          }
        }
        if (m.type === 'affiliateLink') {
          thisArticleHasAffiliate = true;
        }
      }
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        checkNodes(child);
      }
    }
  };
  if (content) checkNodes(content);

  // Check share cap projection (AFFILIATE §7)
  const isAlreadyPublished = status.value === 'published';
  const projectedTotal = totalPublishedArticles.value + (isAlreadyPublished ? 0 : 1);
  const projectedAffiliate =
    totalAffiliateArticles.value + (thisArticleHasAffiliate && !isAlreadyPublished ? 1 : 0);
  const projectedShare = projectedTotal > 0 ? projectedAffiliate / projectedTotal : 0;
  const shareCapExceeded = projectedTotal > 0 && projectedShare > maxAffiliateArticleShare.value;
  const shareCapWarning =
    projectedTotal > 0 && projectedShare >= maxAffiliateArticleShare.value - 0.05;

  return {
    titlePresent: !!title.value.trim(),
    slugValid: slugValid.value,
    excerptPresent: !!excerpt.value.trim(),
    authorProfileComplete: currentUserProfileComplete.value,
    noBlockedDomains: !hasBlockedDomain,
    reviewSatisfied: !needsReview || !!reviewedBy.value,
    noBareMerchantLinks: !hasBareMerchantLink,
    bareMerchantUrl,
    withinShareCap: !shareCapExceeded,
    shareCapWarning,
    projectedShare,
    categorySelected: !!categoryId.value,
    coverSelected: !!coverMediaId.value,
    headingsSequential: !outline.value.some((h) => h.skipped),
  };
});

const canPublish = computed(() => {
  const c = checklist.value;
  return (
    c.titlePresent &&
    c.slugValid &&
    c.excerptPresent &&
    c.authorProfileComplete &&
    c.noBlockedDomains &&
    c.reviewSatisfied &&
    c.noBareMerchantLinks
  );
});

function setNodeType(type: string) {
  if (!editor.value) return;
  if (type === 'paragraph') {
    editor.value.chain().focus().setParagraph().run();
  } else if (type === 'h2') {
    editor.value.chain().focus().toggleHeading({ level: 2 }).run();
  } else if (type === 'h3') {
    editor.value.chain().focus().toggleHeading({ level: 3 }).run();
  } else if (type === 'h4') {
    editor.value.chain().focus().toggleHeading({ level: 4 }).run();
  }
}

const currentNodeType = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  editorTick.value;
  if (!editor.value) return 'paragraph';
  if (editor.value.isActive('heading', { level: 2 })) return 'h2';
  if (editor.value.isActive('heading', { level: 3 })) return 'h3';
  if (editor.value.isActive('heading', { level: 4 })) return 'h4';
  return 'paragraph';
});

function setLink() {
  if (!editor.value) return;
  const previousUrl = editor.value.getAttributes('link').href;
  const url = prompt('ระบุ URL ลิงก์ (https://, /path, mailto:):', previousUrl || '');
  if (url === null) return;
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  // Blocking bare merchant links per AFFILIATE §5
  if (isMerchantUrl(url)) {
    toast.error('ลิงก์นี้เป็นของร้านค้าที่มีลิงก์ affiliate ให้ใช้ลิงก์ affiliate แทน');
    return;
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

const filteredAffiliateLinks = computed(() => {
  const q = affiliateSearchQuery.value.trim().toLowerCase();
  if (!q) return activeAffiliateLinks.value;
  return activeAffiliateLinks.value.filter(
    (l) =>
      l.label.toLowerCase().includes(q) ||
      l.slug.toLowerCase().includes(q) ||
      (l.merchantName && l.merchantName.toLowerCase().includes(q)),
  );
});

function selectAffiliateLink(link: AffiliateLinkItem) {
  if (!editor.value) return;
  editor.value
    .chain()
    .focus()
    .extendMarkRange('affiliateLink')
    .setMark('affiliateLink', { linkId: link.id })
    .run();
  editor.value.chain().focus().unsetMark('link').run();
  affiliatePickerOpen.value = false;
  toast.success(`แทรกลิงก์ affiliate "${link.label}" เรียบร้อย`);
}

function removeAffiliateLink() {
  if (!editor.value) return;
  editor.value.chain().focus().extendMarkRange('affiliateLink').unsetMark('affiliateLink').run();
  affiliatePickerOpen.value = false;
  toast.success('ลบลิงก์ affiliate เรียบร้อย');
}

async function refreshAffiliateData() {
  try {
    const merchantsRes = await api<{ items: MerchantItem[] }>(
      '/api/admin/affiliate/merchants?limit=100',
    );
    merchantsList.value = merchantsRes.items || [];
  } catch {
    // ignore
  }
  try {
    const linksRes = await api<{ items: AffiliateLinkItem[] }>(
      '/api/admin/affiliate/links?limit=100&status=active',
    );
    activeAffiliateLinks.value = linksRes.items || [];
  } catch {
    // ignore
  }
  try {
    const articlesRes = await api<{
      items: Array<{ id: string; status: string; hasAffiliate?: boolean }>;
    }>('/api/admin/articles?limit=100');
    const published = (articlesRes.items || []).filter((a) => a.status === 'published');
    totalPublishedArticles.value = published.length;
    totalAffiliateArticles.value = published.filter((a) => a.hasAffiliate).length;
  } catch {
    // ignore
  }
}

function handlePasteFlowCreated() {
  showPasteFlowModal.value = false;
  refreshAffiliateData();
}

function scrollToHeading(index: number, text?: string) {
  if (typeof document === 'undefined') return;
  const headings = document.querySelectorAll('.prose h2, .prose h3, .prose h4');
  if (headings[index]) {
    headings[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (text) {
    for (const h of headings) {
      if (h.textContent?.trim() === text.trim()) {
        h.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }
}

// Load current user and initial article if editing
onMounted(async () => {
  if (typeof window !== 'undefined') {
    (window as any).__editor = editor;
  }
  refreshAffiliateData();
  try {
    const me = await api<{ id: string; email: string; role: string; profileComplete: boolean }>(
      '/api/admin/me',
    );
    currentUserId.value = me.id;
    currentUserProfileComplete.value = me.profileComplete;

    if (props.initialId) {
      const art = await api<any>(`/api/admin/articles/${props.initialId}`);
      articleId.value = art.id;
      title.value = art.title;
      slug.value = art.slug;
      originalSlug.value = art.slug;
      excerpt.value = art.excerpt || '';
      categoryId.value = art.categoryId;
      tagIds.value = art.tagIds || [];
      coverMediaId.value = art.coverMediaId;
      seoTitle.value = art.seoTitle || '';
      seoDescription.value = art.seoDescription || '';
      status.value = art.status;
      publishedAt.value = art.publishedAt;
      authorId.value = art.authorId;
      reviewedBy.value = art.reviewedBy;
      reviewedAt.value = art.reviewedAt;

      if (art.content && editor.value) {
        editor.value.commands.setContent(normalizeHeadingNodes(art.content));
      }
    }
  } catch (err: any) {
    toast.error(err.message || 'โหลดข้อมูลไม่สำเร็จ');
  } finally {
    loading.value = false;
    setTimeout(() => {
      isInitialLoading = false;
    }, 100);
  }
});

// Autosave debouncing
let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;
let isInitialLoading = !!props.initialId;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureSlugForDraft(draftTitle: string): string {
  if (slug.value.trim() && slugValid.value) {
    return slug.value.trim();
  }
  const fromTitle = slugify(draftTitle);
  if (fromTitle && fromTitle.length >= 2) {
    const candidate = fromTitle.slice(0, 80);
    slug.value = candidate;
    return candidate;
  }
  const fallback = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  slug.value = fallback;
  return fallback;
}

function hasContentToSave(): boolean {
  if (title.value.trim()) return true;
  if (excerpt.value.trim()) return true;
  if (editor.value && !editor.value.isEmpty) return true;
  if (coverMediaId.value) return true;
  return false;
}

function scheduleAutosave() {
  if (isInitialLoading || loading.value) return;
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  saveStatus.value = 'saving';
  autosaveTimeout = setTimeout(() => {
    saveArticle(true);
  }, 1500);
}

watch([title, slug, excerpt, categoryId, tagIds, coverMediaId, seoTitle, seoDescription], () => {
  scheduleAutosave();
});

async function saveArticle(isAuto = false) {
  if (!hasContentToSave()) {
    if (!isAuto) toast.error('กรุณาระบุชื่อบทความหรือเนื้อหาก่อนบันทึก');
    return;
  }

  if (saving.value) {
    pendingSave = true;
    return;
  }

  saving.value = true;
  saveStatus.value = 'saving';

  const effectiveTitle = title.value.trim() || 'บทความไม่มีชื่อ';
  if (!title.value.trim()) {
    title.value = effectiveTitle;
  }
  const effectiveSlug = ensureSlugForDraft(effectiveTitle);

  const payload = {
    title: effectiveTitle,
    slug: effectiveSlug,
    excerpt: excerpt.value.trim(),
    content: normalizeHeadingNodes(editor.value?.getJSON()),
    categoryId: categoryId.value,
    tagIds: tagIds.value,
    coverMediaId: coverMediaId.value,
    seoTitle: seoTitle.value.trim() || null,
    seoDescription: seoDescription.value.trim() || null,
  };

  try {
    if (articleId.value) {
      await api(`/api/admin/articles/${articleId.value}`, {
        method: 'PATCH',
        body: payload,
      });
    } else {
      const created = await api<{ id: string; slug: string }>('/api/admin/articles', {
        method: 'POST',
        body: payload,
      });
      articleId.value = created.id;
      originalSlug.value = created.slug;
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', `/admin/articles/${created.id}/`);
      }
    }

    originalSlug.value = slug.value;
    saveStatus.value = 'saved';
    if (!isAuto) toast.success('บันทึกบทความเรียบร้อย');
  } catch (err: any) {
    saveStatus.value = 'error';
    if (!isAuto) toast.error(err.message || 'บันทึกไม่สำเร็จ');
  } finally {
    saving.value = false;
    if (pendingSave) {
      pendingSave = false;
      saveArticle(true);
    }
  }
}

// Publish, unpublish, and review flows
async function publishNow() {
  if (!canPublish.value || !articleId.value) return;
  saving.value = true;
  try {
    await saveArticle(true);
    await api(`/api/admin/articles/${articleId.value}/publish`, {
      method: 'POST',
      body: {},
    });
    status.value = 'published';
    toast.success('เผยแพร่บทความเรียบร้อยแล้ว');
  } catch (err: any) {
    toast.error(err.message || 'เผยแพร่ไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

async function schedulePublish() {
  if (!articleId.value || !scheduleDate.value) return;
  const combined = `${scheduleDate.value}T${scheduleTime.value || '09:00'}:00+07:00`;
  const ms = new Date(combined).getTime();

  saving.value = true;
  try {
    await saveArticle(true);
    await api(`/api/admin/articles/${articleId.value}/publish`, {
      method: 'POST',
      body: { at: ms },
    });
    status.value = 'scheduled';
    publishedAt.value = ms;
    scheduleModalOpen.value = false;
    toast.success('ตั้งเวลาเผยแพร่เรียบร้อยแล้ว');
  } catch (err: any) {
    toast.error(err.message || 'ตั้งเวลาไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

async function unpublish() {
  if (!articleId.value) return;
  saving.value = true;
  try {
    await api(`/api/admin/articles/${articleId.value}/unpublish`, { method: 'POST' });
    status.value = 'draft';
    toast.success('ยกเลิกการเผยแพร่เรียบร้อย');
  } catch (err: any) {
    toast.error(err.message || 'ยกเลิกการเผยแพร่ไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

async function reviewArticle() {
  if (!articleId.value) return;
  try {
    const res = await api<any>(`/api/admin/articles/${articleId.value}/review`, { method: 'POST' });
    reviewedBy.value = res.reviewedBy;
    reviewedAt.value = res.reviewedAt;
    toast.success('ลงนามตรวจทานบทความเรียบร้อย');
  } catch (err: any) {
    toast.error(err.message || 'ตรวจทานไม่สำเร็จ');
  }
}

async function clearReview() {
  if (!articleId.value) return;
  try {
    await api(`/api/admin/articles/${articleId.value}/review`, { method: 'DELETE' });
    reviewedBy.value = null;
    reviewedAt.value = null;
    toast.success('ยกเลิกการตรวจทานเรียบร้อย');
  } catch (err: any) {
    toast.error(err.message || 'ยกเลิกการตรวจทานไม่สำเร็จ');
  }
}

const previewing = ref(false);

async function openPreview() {
  if (!hasContentToSave() && !articleId.value) {
    toast.error('กรุณาระบุชื่อบทความหรือเนื้อหาก่อนดูตัวอย่าง');
    return;
  }

  let previewWindow: Window | null = null;
  if (typeof window !== 'undefined') {
    previewWindow = window.open('about:blank', '_blank');
  }

  previewing.value = true;
  try {
    // If article is unsaved, saving, or has pending debounced autosave: save immediately before previewing
    if (saveStatus.value === 'saving' || autosaveTimeout || !articleId.value) {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
        autosaveTimeout = null;
      }
      await saveArticle(true);
    }

    if (articleId.value) {
      const previewUrl = `/admin/preview/${articleId.value}/`;
      if (previewWindow) {
        previewWindow.location.href = previewUrl;
      } else if (typeof window !== 'undefined') {
        window.open(previewUrl, '_blank');
      }
    } else {
      if (previewWindow) previewWindow.close();
      toast.error('ไม่สามารถบันทึกฉบับร่างสำหรับดูตัวอย่างได้');
    }
  } catch (err: any) {
    if (previewWindow) previewWindow.close();
    toast.error(err.message || 'เกิดข้อผิดพลาดในการเปิดหน้าตัวอย่าง');
  } finally {
    previewing.value = false;
  }
}

function openBodyMediaPicker() {
  mediaPickerTarget.value = 'body';
}

function openCoverMediaPicker() {
  mediaPickerTarget.value = 'cover';
}

function handleMediaSelect(m: PickedMedia) {
  if (mediaPickerTarget.value === 'body') {
    if (editor.value) {
      editor.value
        .chain()
        .focus()
        // Body image insertion: stores media ref `media:<id>`, rendered as public AVIF/WebP <picture> by P2-01.
        .setImage({
          src: `media:${m.id}`,
          alt: m.alt || '',
          mediaId: m.id,
        } as any)
        .run();
      toast.success('แทรกรูปภาพในเนื้อหาเรียบร้อย');
    }
  } else if (mediaPickerTarget.value === 'cover') {
    coverMediaId.value = m.id;
    toast.success('เลือกภาพหน้าปกเรียบร้อย');
  }
  mediaPickerTarget.value = null;
}

function insertYoutube() {
  const url = prompt('ใส่ URL ของวิดีโอ YouTube:');
  if (!url) return;
  const idMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
  );
  if (idMatch && idMatch[1]) {
    editor.value?.commands.setYoutubeVideo({ src: url });
  } else {
    toast.error('URL ของ YouTube ไม่ถูกต้อง');
  }
}

onBeforeUnmount(() => {
  editor.value?.destroy();
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
});
</script>

<template>
  <div v-if="loading" class="p-16 flex justify-center items-center">
    <Spinner :size="32" />
  </div>

  <div v-else class="space-y-6">
    <!-- Top Action Bar -->
    <header
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4"
    >
      <div class="flex items-center gap-3">
        <a
          href="/admin/articles/"
          class="text-caption font-semibold text-muted hover:text-text transition-colors"
        >
          ← รายการบทความ
        </a>
        <span class="text-border">/</span>
        <Badge v-if="status === 'published'" variant="success">เผยแพร่แล้ว</Badge>
        <Badge v-else-if="status === 'scheduled'" variant="warning">
          ตั้งเวลา ({{ publishedAt ? formatThaiDate(publishedAt) : '' }})
        </Badge>
        <Badge v-else variant="neutral">ฉบับร่าง</Badge>

        <span class="text-caption text-muted tabular-nums ml-2">
          <span v-if="saveStatus === 'saving'" class="text-brand">กำลังบันทึก…</span>
          <span v-else-if="saveStatus === 'error'" class="text-danger">บันทึกไม่สำเร็จ</span>
          <span v-else-if="saveStatus === 'saved'" class="opacity-75">บันทึกแล้ว</span>
          <span v-else class="opacity-50">ยังไม่ได้บันทึก</span>
        </span>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          :disabled="previewing || loading"
          class="inline-flex min-h-[38px] items-center rounded-full border border-border bg-surface px-4 py-1.5 text-body-sm font-semibold text-text hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
          @click="openPreview"
        >
          {{ previewing ? 'กำลังเตรียมตัวอย่าง…' : 'ดูตัวอย่าง ↗' }}
        </button>

        <template v-if="status === 'published'">
          <button
            type="button"
            class="inline-flex min-h-[38px] items-center rounded-full border border-danger/40 bg-danger/10 px-4 py-1.5 text-body-sm font-semibold text-danger hover:bg-danger/20 transition-colors"
            @click="unpublish"
          >
            ยกเลิกการเผยแพร่
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="inline-flex min-h-[38px] items-center rounded-full border border-border bg-surface px-4 py-1.5 text-body-sm font-semibold text-text hover:border-brand transition-colors"
            @click="scheduleModalOpen = true"
          >
            ตั้งเวลา…
          </button>
          <button
            type="button"
            :disabled="saving"
            class="inline-flex min-h-[38px] items-center rounded-full border border-border bg-surface px-4 py-1.5 text-body-sm font-semibold text-text hover:border-brand transition-colors"
            @click="saveArticle(false)"
          >
            บันทึกฉบับร่าง
          </button>
          <button
            type="button"
            :disabled="!canPublish || saving"
            class="inline-flex min-h-[38px] items-center rounded-full bg-brand px-5 py-1.5 text-body-sm font-semibold text-brand-contrast shadow-sm hover:bg-brand-deep disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            @click="publishNow"
          >
            เผยแพร่
          </button>
        </template>
      </div>
    </header>

    <!-- 3-Column Editor Layout (DESIGN §9) -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      <!-- Left Column: Dynamic Outline (XL screens) -->
      <aside
        class="hidden xl:block xl:col-span-2 rounded-xl border border-border bg-surface p-4 sticky top-6 shadow-sm"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-caption font-bold text-text uppercase tracking-wider">โครงสร้างหัวข้อ</p>
          <span class="text-caption text-muted font-mono font-medium">{{ outline.length }}</span>
        </div>
        <ul v-if="outline.length > 0" class="space-y-2 text-caption">
          <li v-for="item in outline" :key="item.id" class="group">
            <div
              :class="[
                'flex items-center gap-1.5 cursor-pointer transition-colors',
                item.level === 3
                  ? 'pl-3 text-muted hover:text-brand'
                  : item.level === 4
                    ? 'pl-6 text-muted hover:text-brand'
                    : 'font-semibold text-text hover:text-brand',
              ]"
              @click="scrollToHeading(item.index, item.text)"
            >
              <span
                class="rounded bg-border px-1 py-0.2 text-[0.65rem] font-mono font-bold text-muted group-hover:bg-brand/10 group-hover:text-brand shrink-0"
              >
                H{{ item.level }}
              </span>
              <span class="line-clamp-1 flex-1">{{ item.text || '(ไม่มีข้อความ)' }}</span>
            </div>
            <div
              v-if="item.skipped"
              class="mt-0.5 ml-2 text-[0.7rem] text-warning flex items-center gap-1 font-medium"
            >
              <span>⚠ {{ item.skipMessage }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="text-[0.75rem] text-muted italic">ยังไม่มีหัวข้อ H2–H4 ในเนื้อหา</p>

        <div
          class="mt-4 pt-3 border-t border-border flex flex-col gap-1 text-[0.8rem] text-muted font-medium"
        >
          <span>{{ totalContentWords.toLocaleString() }} คำ</span>
          <span>อ่าน {{ totalReadingMinutes }} นาที</span>
        </div>
      </aside>

      <!-- Center Column: Editor (xl:col-span-7, spacious) -->
      <main class="xl:col-span-7 space-y-5">
        <!-- 1. Document Title (outside Text Editor) -->
        <div>
          <label class="block text-caption font-semibold text-text mb-1">
            หัวข้อบทความ (Article Title)
          </label>
          <input
            v-model="title"
            type="text"
            placeholder="ชื่อบทความ..."
            class="w-full text-lg sm:text-xl font-bold text-text placeholder:text-muted/40 rounded-xl border border-border bg-bg px-4 py-3 focus-visible:border-brand shadow-sm transition-colors"
          />
          <div class="mt-1.5 flex justify-between text-caption text-muted tabular-nums px-1">
            <span>ความยาวแนะนำ 30–60 ตัวอักษร</span>
            <span
              :class="
                titleGraphemes > 60 || titleGraphemes < 30 ? 'text-warning font-semibold' : ''
              "
            >
              {{ titleGraphemes }} ตัวอักษร
            </span>
          </div>
        </div>

        <!-- 2. Permalink Row (outside Text Editor, matching Image 2) -->
        <div
          class="flex flex-wrap items-center gap-2 text-caption text-muted py-2.5 px-4 rounded-xl border border-border bg-surface"
        >
          <span class="font-semibold text-text">Permalink:</span>
          <span class="font-mono text-text-secondary truncate">
            example.com/articles/{{ slug || 'slug' }}/
          </span>
          <span class="ml-auto text-[0.7rem] text-muted">
            (แก้ไข slug ได้ที่แถบตั้งค่าด้านขวา)
          </span>
        </div>

        <!-- 3. Excerpt / Lead Summary (outside Text Editor) -->
        <div class="rounded-xl border border-border bg-surface p-4 space-y-1.5">
          <label class="block text-caption font-semibold text-text">
            บทนำสั้น (Answer-first Lead Excerpt)
          </label>
          <textarea
            v-model="excerpt"
            rows="2"
            placeholder="สรุปสาระสำคัญของบทความที่ตอบคำถามของผู้อ่านใน 1 ย่อหน้า..."
            class="w-full text-body text-text-secondary placeholder:text-muted/50 rounded-lg border border-border/80 bg-bg p-3 focus-visible:border-brand resize-none leading-relaxed"
          ></textarea>
          <div class="flex justify-between text-[0.75rem] text-muted tabular-nums px-1">
            <span>แนะนำ 40–60 คำ</span>
            <span :class="excerptWords < 40 || excerptWords > 60 ? 'text-warning' : ''">
              {{ excerptWords }} คำ ({{ excerptGraphemes }} ตัวอักษร)
            </span>
          </div>
        </div>

        <!-- 4. Text Editor (Elevated Document Card with Toolbar + EditorContent ONLY) -->
        <div class="rounded-2xl border border-border bg-bg shadow-card overflow-hidden">
          <!-- Top Docked Toolbar (matching Image 1 & 2) -->
          <div
            class="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur-md p-2 sm:px-3 sm:py-2 flex flex-wrap items-center gap-1 text-caption"
          >
            <!-- Style Dropdown (Paragraph ⌄ / H2 / H3 / H4) -->
            <div class="relative">
              <select
                :value="currentNodeType"
                class="h-8 rounded-lg border border-border bg-surface px-2.5 py-1 text-caption font-semibold text-text focus-visible:border-brand focus-visible:outline-none cursor-pointer"
                title="ระดับหัวข้อและรูปแบบข้อความ"
                @change="setNodeType(($event.target as HTMLSelectElement).value)"
              >
                <option value="paragraph">ข้อความปกติ (Paragraph)</option>
                <option value="h2">หัวข้อ 2 (Heading 2)</option>
                <option value="h3">หัวข้อ 3 (Heading 3)</option>
                <option value="h4">หัวข้อ 4 (Heading 4)</option>
              </select>
            </div>

            <span class="h-4 w-px bg-border mx-1" aria-hidden="true" />

            <!-- Bold, Italic, Underline, Strikethrough, Code -->
            <button
              type="button"
              :class="[
                'size-8 rounded-lg font-bold flex items-center justify-center transition-colors',
                editor?.isActive('bold')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="ตัวหนา (Ctrl+B)"
              aria-label="ตัวหนา"
              @click="editor?.chain().focus().toggleBold().run()"
            >
              <span class="text-sm font-black">B</span>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg font-serif italic flex items-center justify-center transition-colors',
                editor?.isActive('italic')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="ตัวเอียง (Ctrl+I)"
              aria-label="ตัวเอียง"
              @click="editor?.chain().focus().toggleItalic().run()"
            >
              <span class="text-sm font-serif italic font-bold">I</span>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg underline flex items-center justify-center transition-colors',
                editor?.isActive('underline')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="ขีดเส้นใต้ (Ctrl+U)"
              aria-label="ขีดเส้นใต้"
              @click="editor?.chain().focus().toggleMark('underline').run()"
            >
              <span class="text-sm underline underline-offset-2 font-bold">U</span>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg line-through flex items-center justify-center transition-colors',
                editor?.isActive('strike')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="ขีดฆ่า"
              aria-label="ขีดฆ่า"
              @click="editor?.chain().focus().toggleStrike().run()"
            >
              <span class="text-sm line-through font-bold">S</span>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg font-mono flex items-center justify-center transition-colors text-[0.8rem]',
                editor?.isActive('code')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="โค้ดคำสั้น"
              aria-label="โค้ดคำสั้น"
              @click="editor?.chain().focus().toggleCode().run()"
            >
              &lt;/&gt;
            </button>

            <span class="h-4 w-px bg-border mx-1" aria-hidden="true" />

            <!-- Lists, Quote, CodeBlock, HR -->
            <button
              type="button"
              :class="[
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                editor?.isActive('bulletList')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="รายการแบบจุด"
              aria-label="รายการแบบจุด"
              @click="editor?.chain().focus().toggleBulletList().run()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="9" y1="6" x2="20" y2="6" />
                <line x1="9" y1="12" x2="20" y2="12" />
                <line x1="9" y1="18" x2="20" y2="18" />
                <circle cx="4" cy="6" r="2" />
                <circle cx="4" cy="12" r="2" />
                <circle cx="4" cy="18" r="2" />
              </svg>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                editor?.isActive('orderedList')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="รายการลำดับตัวเลข"
              aria-label="รายการลำดับตัวเลข"
              @click="editor?.chain().focus().toggleOrderedList().run()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="10" y1="6" x2="21" y2="6" />
                <line x1="10" y1="12" x2="21" y2="12" />
                <line x1="10" y1="18" x2="21" y2="18" />
                <path d="M4 6h1v4" />
                <path d="M4 10h2" />
                <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
              </svg>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                editor?.isActive('blockquote')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="คำพูดที่ยกมา (Blockquote)"
              aria-label="คำพูดที่ยกมา"
              @click="editor?.chain().focus().toggleBlockquote().run()"
            >
              <span class="text-base font-serif font-black">“</span>
            </button>
            <button
              type="button"
              :class="[
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                editor?.isActive('codeBlock')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="บล็อกโค้ด (CodeBlock)"
              aria-label="บล็อกโค้ด"
              @click="editor?.chain().focus().toggleCodeBlock().run()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            <button
              type="button"
              class="size-8 rounded-lg flex items-center justify-center text-text hover:bg-surface transition-colors"
              title="เส้นแบ่งคั่น (HR)"
              aria-label="เส้นแบ่งคั่น"
              @click="editor?.chain().focus().setHorizontalRule().run()"
            >
              <span class="text-sm font-bold">—</span>
            </button>

            <span class="h-4 w-px bg-border mx-1" aria-hidden="true" />

            <!-- Link, Image, YouTube -->
            <button
              type="button"
              :class="[
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                editor?.isActive('link')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface',
              ]"
              title="แทรกลิงก์"
              aria-label="แทรกลิงก์"
              @click="setLink"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
            <!-- Affiliate Link Button -->
            <button
              type="button"
              :class="[
                'px-2.5 h-8 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors',
                editor?.isActive('affiliateLink')
                  ? 'bg-brand text-brand-contrast shadow-xs'
                  : 'text-text hover:bg-surface border border-border/60',
              ]"
              title="แทรกลิงก์ affiliate"
              aria-label="แทรกลิงก์ affiliate"
              @click="affiliatePickerOpen = true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>ลิงก์ affiliate</span>
            </button>
            <button
              type="button"
              class="size-8 rounded-lg flex items-center justify-center text-text hover:bg-surface transition-colors"
              title="แทรกรูปภาพจากคลังสื่อ"
              aria-label="แทรกรูปภาพ"
              @click="openBodyMediaPicker"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <button
              type="button"
              class="size-8 rounded-lg flex items-center justify-center text-text hover:bg-surface transition-colors"
              title="แทรกวิดีโอ YouTube"
              aria-label="แทรกวิดีโอ YouTube"
              @click="insertYoutube"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>

            <!-- Undo / Redo on right side -->
            <div class="ml-auto flex items-center gap-1">
              <button
                type="button"
                :disabled="!editor?.can().undo()"
                class="size-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="เลิกทำ (Ctrl+Z)"
                aria-label="เลิกทำ"
                @click="editor?.chain().focus().undo().run()"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                </svg>
              </button>
              <button
                type="button"
                :disabled="!editor?.can().redo()"
                class="size-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="ทำซ้ำ (Ctrl+Y)"
                aria-label="ทำซ้ำ"
                @click="editor?.chain().focus().redo().run()"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="m15 14 5-5-5-5" />
                  <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Text Editor Content Area ONLY -->
          <div class="px-6 pt-4 pb-6 sm:px-8 sm:pt-4 sm:pb-8 relative">
            <!-- Bubble Menu (AFFILIATE §5) -->
            <BubbleMenu
              v-if="editor"
              :editor="editor"
              :tippy-options="{ duration: 100 }"
              class="flex items-center gap-1 p-1 bg-surface border border-border rounded-xl shadow-elevated"
            >
              <button
                type="button"
                :class="[
                  'px-2 py-1 text-xs rounded hover:bg-bg transition-colors',
                  editor.isActive('bold') ? 'font-bold text-brand' : 'text-text',
                ]"
                @click="editor.chain().focus().toggleBold().run()"
              >
                B
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 text-xs rounded hover:bg-bg transition-colors',
                  editor.isActive('italic') ? 'italic text-brand' : 'text-text',
                ]"
                @click="editor.chain().focus().toggleItalic().run()"
              >
                I
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 text-xs rounded hover:bg-bg transition-colors',
                  editor.isActive('underline') ? 'underline text-brand' : 'text-text',
                ]"
                @click="editor.chain().focus().toggleMark('underline').run()"
              >
                U
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 text-xs rounded hover:bg-bg transition-colors',
                  editor.isActive('link') ? 'text-brand font-semibold' : 'text-text',
                ]"
                @click="setLink"
              >
                ลิงก์
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 text-xs rounded flex items-center gap-1 hover:bg-bg transition-colors',
                  editor.isActive('affiliateLink')
                    ? 'bg-brand/15 text-brand font-semibold'
                    : 'text-text',
                ]"
                @click="affiliatePickerOpen = true"
              >
                <span>ลิงก์ affiliate</span>
              </button>
            </BubbleMenu>
            <EditorContent :editor="editor" class="min-h-[460px] focus:outline-none" />
          </div>
        </div>
      </main>

      <!-- Right Column: Settings Panel (DESIGN §9.4, §9.5, xl:col-span-3) -->
      <aside class="xl:col-span-3 space-y-6">
        <!-- Slug and Published Warnings -->
        <div class="rounded-xl border border-border bg-bg p-5 shadow-sm space-y-4">
          <p class="text-body-sm font-bold text-text">ลิงก์บทความ (Slug)</p>
          <div>
            <div
              class="flex items-center rounded-xl border border-border-input bg-bg px-3 py-1.5 focus-within:border-brand focus-within:outline-1 focus-within:outline-brand focus-within:outline"
            >
              <span class="text-caption text-muted font-mono select-none">/articles/</span>
              <input
                v-model="slug"
                type="text"
                placeholder="my-article-slug"
                class="w-full text-caption font-mono text-text bg-transparent border-0 p-1 focus:ring-0 focus:outline-none"
              />
            </div>
            <p v-if="!slugValid && slug" class="mt-1.5 text-caption text-danger">
              ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น (a-z, 0-9, -)
            </p>
            <p
              v-if="status === 'published' && slug !== originalSlug"
              class="mt-2 text-caption text-warning bg-warning/10 p-2.5 rounded-lg border border-warning/30"
            >
              ⚠️ คุณกำลังเปลี่ยน slug ของบทความที่เผยแพร่แล้ว ระบบจะสร้างการส่งต่อ (301 redirect)
              จากลิงก์เดิมให้อัตโนมัติ
            </p>
          </div>
        </div>

        <!-- Taxonomy & Cover Media -->
        <div class="rounded-xl border border-border bg-bg p-5 shadow-sm space-y-4">
          <p class="text-body-sm font-bold text-text">ข้อมูลหมวดหมู่และสื่อ</p>

          <CategorySelect v-model="categoryId" />
          <TagSelect v-model="tagIds" />

          <div class="border-t border-border pt-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="block text-body-sm font-medium text-text">ภาพหน้าปกบทความ</span>
              <span
                v-if="!coverMediaId"
                class="text-caption font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full text-[0.7rem]"
              >
                🎨 ภาพปกอัตโนมัติ
              </span>
            </div>

            <!-- Live Cover Preview (Custom Uploaded vs Auto-Generated Branded Card) -->
            <div
              v-if="coverMediaId"
              class="relative aspect-video w-full rounded-xl overflow-hidden border border-border bg-surface shadow-sm group"
            >
              <img
                :src="`/api/admin/media/${coverMediaId}/file`"
                alt="ภาพหน้าปก"
                class="size-full object-cover"
              />
              <button
                type="button"
                class="absolute top-2 right-2 p-1.5 rounded-lg bg-bg/90 hover:bg-bg text-muted hover:text-danger shadow transition-colors"
                title="นำรูปออก (สลับไปใช้ภาพปกอัตโนมัติ)"
                @click="coverMediaId = null"
              >
                <Icon name="x" :size="16" />
              </button>
            </div>
            <div
              v-else
              class="relative aspect-video w-full rounded-xl overflow-hidden border border-border bg-gradient-to-br from-bg to-surface p-4 flex flex-col justify-between shadow-sm border-b-4 border-b-brand"
            >
              <div class="flex items-center justify-between text-[0.7rem] font-bold text-brand">
                <span>ชื่อเว็บไซต์</span>
                <span class="text-muted font-normal text-[0.65rem]">สร้างจากหัวข้ออัตโนมัติ</span>
              </div>
              <p class="text-caption font-bold text-text line-clamp-2 leading-snug">
                {{ title || 'ชื่อบทความของคุณ...' }}
              </p>
              <div class="flex items-center justify-between text-[0.65rem] text-muted font-medium">
                <span>{{ categoryId ? 'มีหมวดหมู่' : 'หมวดหมู่ทั่วไป' }}</span>
                <span>ระบบสร้างให้เมื่อเผยแพร่</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex-1 px-4 py-2 rounded-xl border border-border bg-surface text-caption font-semibold text-text hover:border-brand transition-colors text-center"
                @click="openCoverMediaPicker"
              >
                {{ coverMediaId ? 'เปลี่ยนรูปจากคลังสื่อ' : '+ เลือกรูปจากคลังสื่อ' }}
              </button>
              <button
                v-if="coverMediaId"
                type="button"
                class="px-3 py-2 rounded-xl border border-border bg-surface text-caption font-semibold text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                title="สลับไปใช้ภาพปกอัตโนมัติ"
                @click="coverMediaId = null"
              >
                รีเซ็ต
              </button>
            </div>
          </div>
        </div>

        <!-- Reviewer Box (DESIGN §9.5, D25, D29) -->
        <div class="rounded-xl border border-border bg-bg p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-body-sm font-bold text-text">ผู้ตรวจทาน (Reviewer)</p>
            <span v-if="reviewedBy" class="text-caption text-success font-medium"
              >ตรวจทานแล้ว ✓</span
            >
          </div>

          <div
            v-if="reviewedBy"
            class="p-3 rounded-lg bg-surface border border-border text-caption space-y-2"
          >
            <p class="text-text font-semibold">
              ตรวจทานเมื่อ: {{ formatThaiDate(reviewedAt || Date.now()) }}
            </p>
            <p class="text-muted">รหัสผู้ตรวจทาน: {{ reviewedBy }}</p>
            <button
              v-if="reviewedBy === currentUserId || userRole === 'admin' || userRole === 'owner'"
              type="button"
              class="text-danger hover:underline font-medium text-[0.75rem]"
              @click="clearReview"
            >
              ยกเลิกการตรวจทาน
            </button>
          </div>
          <div v-else>
            <p class="text-caption text-muted mb-3">ยังไม่มีผู้ตรวจทานบทความนี้</p>
            <button
              v-if="authorId !== currentUserId"
              type="button"
              class="w-full px-3 py-2 rounded-lg border border-brand/40 bg-brand-subdued/20 text-caption font-semibold text-brand hover:bg-brand-subdued/35 transition-colors"
              @click="reviewArticle"
            >
              ตรวจทานบทความนี้
            </button>
          </div>
        </div>

        <!-- Pre-publish Checklist (DESIGN §9.5) -->
        <div class="rounded-xl border border-border bg-bg p-5 shadow-sm space-y-3">
          <p class="text-body-sm font-bold text-text">เช็กลิสต์ความปลอดภัยก่อนเผยแพร่</p>
          <ul class="space-y-2 text-caption">
            <li class="flex items-center gap-2">
              <span :class="checklist.titlePresent ? 'text-success' : 'text-danger'">{{
                checklist.titlePresent ? '✓' : '✗'
              }}</span>
              <span>ระบุชื่อบทความ</span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.slugValid ? 'text-success' : 'text-danger'">{{
                checklist.slugValid ? '✓' : '✗'
              }}</span>
              <span>Slug ถูกต้องตามรูปแบบ</span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.excerptPresent ? 'text-success' : 'text-danger'">{{
                checklist.excerptPresent ? '✓' : '✗'
              }}</span>
              <span>ระบุบทนำสั้น (Excerpt)</span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.authorProfileComplete ? 'text-success' : 'text-danger'">{{
                checklist.authorProfileComplete ? '✓' : '✗'
              }}</span>
              <span>โปรไฟล์ผู้เขียนครบสมบูรณ์ (E-E-A-T)</span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.noBlockedDomains ? 'text-success' : 'text-danger'">{{
                checklist.noBlockedDomains ? '✓' : '✗'
              }}</span>
              <span>ไม่มีลิงก์ไปยังโดเมนต้องห้าม</span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.noBareMerchantLinks ? 'text-success' : 'text-danger'">{{
                checklist.noBareMerchantLinks ? '✓' : '✗'
              }}</span>
              <span v-if="checklist.noBareMerchantLinks">ไม่มีลิงก์ตรงไปยังร้านค้าพันธมิตร</span>
              <span v-else class="text-danger">
                พบลิงก์ตรงร้านค้า ({{ checklist.bareMerchantUrl }}) ให้ใช้ลิงก์ affiliate
              </span>
            </li>
            <li class="flex items-center gap-2">
              <span :class="checklist.reviewSatisfied ? 'text-success' : 'text-danger'">{{
                checklist.reviewSatisfied ? '✓' : '✗'
              }}</span>
              <span>การตรวจทานเนื้อหาตามนโยบาย</span>
            </li>
            <li class="flex items-center gap-2">
              <span
                :class="checklist.headingsSequential ? 'text-success' : 'text-warning font-bold'"
                >{{ checklist.headingsSequential ? '✓' : '⚠' }}</span
              >
              <span v-if="checklist.headingsSequential">ลำดับหัวข้อถูกต้อง (H2–H4)</span>
              <span v-else class="text-warning">
                พบการข้ามระดับหัวข้อ (เช่น ข้ามจาก H2 ไป H4)
              </span>
            </li>
            <li
              v-if="checklist.shareCapWarning || !checklist.withinShareCap"
              class="flex items-start gap-2 text-warning pt-1"
            >
              <span class="select-none">⚠️</span>
              <span>
                คำเตือน: สัดส่วนบทความ affiliate จะอยู่ที่
                {{ (checklist.projectedShare * 100).toFixed(1) }}% (เพดานไม่เกิน
                {{ (maxAffiliateArticleShare * 100).toFixed(0) }}%)
              </span>
            </li>
          </ul>
        </div>

        <!-- SEO Snippet Preview Tool (inspired by aqibmunir.com/serp-snippet-preview-tool/) -->
        <div class="rounded-xl border border-border bg-bg p-5 shadow-sm space-y-4">
          <!-- Header & Device Toggle -->
          <div class="flex items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <p class="text-body-sm font-bold text-text">ตัวอย่างบน Google (SERP Preview)</p>
              <p class="text-[0.7rem] text-muted">จำลองผลการค้นหาตามอัลกอริทึมของ Google</p>
            </div>
            <!-- Device View Switcher (Desktop vs Mobile) -->
            <div
              class="flex items-center rounded-lg border border-border bg-surface p-0.5 text-caption font-semibold"
            >
              <button
                type="button"
                :class="[
                  'px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5',
                  serpDevice === 'desktop'
                    ? 'bg-bg text-text shadow-sm'
                    : 'text-muted hover:text-text',
                ]"
                @click="serpDevice = 'desktop'"
              >
                <span>💻 จอคอม</span>
              </button>
              <button
                type="button"
                :class="[
                  'px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5',
                  serpDevice === 'mobile'
                    ? 'bg-bg text-text shadow-sm'
                    : 'text-muted hover:text-text',
                ]"
                @click="serpDevice = 'mobile'"
              >
                <span>📱 มือถือ</span>
              </button>
            </div>
          </div>

          <!-- Quick Actions: Copy and Sync -->
          <div class="flex flex-wrap items-center gap-2 text-caption">
            <button
              type="button"
              class="px-2.5 py-1 rounded-md border border-border bg-surface text-text hover:border-brand hover:text-brand transition-colors text-[0.75rem]"
              @click="copyTitle"
            >
              {{ copyTitleSuccess ? 'คัดลอก Title แล้ว ✓' : 'คัดลอก Title' }}
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md border border-border bg-surface text-text hover:border-brand hover:text-brand transition-colors text-[0.75rem]"
              @click="copyDescription"
            >
              {{ copyDescSuccess ? 'คัดลอก Desc แล้ว ✓' : 'คัดลอก Description' }}
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md border border-brand/30 bg-brand-subdued/20 text-brand font-medium hover:bg-brand-subdued/40 transition-colors ml-auto text-[0.75rem]"
              @click="syncFromArticle"
            >
              ดึงจากบทความ
            </button>
          </div>

          <!-- Realistic Google SERP Mockup Box -->
          <div
            :class="[
              'rounded-xl border border-border/80 bg-surface p-4 transition-all',
              serpDevice === 'mobile'
                ? 'max-w-[340px] mx-auto border-2 border-border shadow-sm'
                : 'w-full',
            ]"
          >
            <!-- Google SERP Header: Favicon + Domain + Breadcrumb -->
            <div class="flex items-center gap-2 text-caption">
              <!-- Site favicon icon -->
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast font-bold text-[0.65rem] shadow-sm"
              >
                H
              </span>
              <div class="min-w-0 flex-1 leading-tight">
                <p class="font-medium text-text truncate text-[0.8rem]">เว็บไซต์</p>
                <p class="text-[0.7rem] text-muted font-mono truncate">
                  example.com › articles › {{ slug || 'slug' }}
                </p>
              </div>
            </div>

            <!-- Title in SERP blue with Thai line-height and hover underline -->
            <h3
              :class="[
                'mt-2 font-medium leading-[1.35] text-moss-secondary hover:underline cursor-pointer',
                serpDevice === 'mobile' ? 'text-[1.125rem]' : 'text-[1.2rem]',
              ]"
            >
              {{ effectiveSeoTitle }}
            </h3>

            <!-- Description in SERP dark grey with realistic line clamp -->
            <p class="mt-1.5 text-[0.875rem] leading-[1.45] text-moss-muted line-clamp-2">
              {{ effectiveSeoDesc }}
            </p>
          </div>

          <!-- Live Inputs with Progress Bars & Quality Badges -->
          <div class="space-y-4 pt-2">
            <!-- SEO Title Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-caption">
                <label class="font-semibold text-text">ชื่อสำหรับ Google (SEO Title)</label>
                <div class="flex items-center gap-2 tabular-nums">
                  <span
                    :class="[
                      'text-[0.7rem] font-semibold px-2 py-0.5 rounded-full',
                      titleStatus.tone === 'success'
                        ? 'bg-success/15 text-success'
                        : titleStatus.tone === 'warning'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-danger/15 text-danger',
                    ]"
                  >
                    {{ titleStatus.label }}
                  </span>
                  <span class="text-muted text-[0.75rem]">{{ seoTitleGraphemes }} / 60</span>
                </div>
              </div>
              <input
                v-model="seoTitle"
                type="text"
                placeholder="ปล่อยว่างเพื่อใช้ชื่อบทความ"
                class="w-full rounded-xl border border-border-input bg-bg p-2.5 text-body-sm text-text focus-visible:border-brand shadow-sm"
              />
              <!-- Progress bar -->
              <div class="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
                <div
                  :class="['h-full transition-all duration-300 rounded-full', titleStatus.barClass]"
                  :style="{ width: `${titleStatus.percent}%` }"
                ></div>
              </div>
              <p class="text-[0.7rem] text-muted">
                แนะนำ 30–60 ตัวอักษร เพื่อให้แสดงผลครบถ้วนไม่ถูก Google ตัดทอน
              </p>
            </div>

            <!-- SEO Description Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-caption">
                <label class="font-semibold text-text"
                  >คำอธิบายสำหรับ Google (SEO Description)</label
                >
                <div class="flex items-center gap-2 tabular-nums">
                  <span
                    :class="[
                      'text-[0.7rem] font-semibold px-2 py-0.5 rounded-full',
                      descStatus.tone === 'success'
                        ? 'bg-success/15 text-success'
                        : descStatus.tone === 'warning'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-danger/15 text-danger',
                    ]"
                  >
                    {{ descStatus.label }}
                  </span>
                  <span class="text-muted text-[0.75rem]">{{ seoDescGraphemes }} / 155</span>
                </div>
              </div>
              <textarea
                v-model="seoDescription"
                rows="3"
                placeholder="ปล่อยว่างเพื่อใช้บทนำสั้น"
                class="w-full rounded-xl border border-border-input bg-bg p-2.5 text-body-sm text-text focus-visible:border-brand resize-none shadow-sm"
              ></textarea>
              <!-- Progress bar -->
              <div class="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
                <div
                  :class="['h-full transition-all duration-300 rounded-full', descStatus.barClass]"
                  :style="{ width: `${descStatus.percent}%` }"
                ></div>
              </div>
              <p class="text-[0.7rem] text-muted">
                แนะนำ 70–155 ตัวอักษร สรุปเนื้อหาและมีคำสำคัญหลักเพื่อเพิ่ม CTR
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Media Picker Modal -->
    <MediaPicker
      :open="isMediaPickerOpen"
      @update:open="if (!$event) mediaPickerTarget = null;"
      @select="handleMediaSelect"
    />

    <!-- Scheduling Modal -->
    <Modal
      :open="scheduleModalOpen"
      title="ตั้งเวลาเผยแพร่บทความ"
      @update:open="scheduleModalOpen = $event"
    >
      <div class="space-y-4">
        <p class="text-body-sm text-text-secondary">
          กำหนดวันและเวลาที่ต้องการให้บทความเผยแพร่อัตโนมัติ (เวลาประเทศไทย Asia/Bangkok)
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-caption font-medium text-text mb-1">วันที่</label>
            <input
              v-model="scheduleDate"
              type="date"
              class="w-full rounded-xl border border-border-input bg-bg p-2.5 text-body-sm text-text"
            />
          </div>
          <div>
            <label class="block text-caption font-medium text-text mb-1">เวลา</label>
            <input
              v-model="scheduleTime"
              type="time"
              class="w-full rounded-xl border border-border-input bg-bg p-2.5 text-body-sm text-text"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-4 border-t border-border">
          <button
            type="button"
            class="px-4 py-2 rounded-full border border-border text-body-sm font-semibold text-text hover:bg-surface"
            @click="scheduleModalOpen = false"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            :disabled="!scheduleDate || saving"
            class="px-5 py-2 rounded-full bg-brand text-body-sm font-semibold text-brand-contrast hover:bg-brand-deep disabled:opacity-50"
            @click="schedulePublish"
          >
            ยืนยันการตั้งเวลา
          </button>
        </div>
      </div>
    </Modal>

    <!-- Affiliate Link Picker Modal (AFFILIATE §5) -->
    <Modal
      :open="affiliatePickerOpen"
      title="เลือกหรือแทรกลิงก์ affiliate"
      @update:open="affiliatePickerOpen = $event"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-caption font-medium text-text mb-1.5"
            >ค้นหาลิงก์ affiliate</label
          >
          <input
            v-model="affiliateSearchQuery"
            type="search"
            class="w-full rounded-xl border border-border-input bg-bg p-2.5 text-body-sm text-text focus-visible:border-brand shadow-sm"
            placeholder="ค้นหาตามชื่อ ป้ายกำกับ ร้านค้า หรือ slug..."
          />
        </div>

        <!-- Role Action: Admin Shortcut or Editor Note (AFFILIATE §5, D35) -->
        <div
          v-if="props.userRole === 'admin' || props.userRole === 'owner'"
          class="flex justify-end"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-caption font-semibold text-brand hover:text-brand-deep underline cursor-pointer"
            @click="
              showPasteFlowModal = true;
              affiliatePickerOpen = false;
            "
          >
            + เพิ่มลิงก์ใหม่ (Admin Shortcut)
          </button>
        </div>
        <div
          v-else
          class="rounded-xl border border-border/80 bg-surface/50 p-3 text-caption text-muted"
        >
          ยังไม่มีลิงก์ที่ต้องการ? ขอให้ผู้ดูแลระบบเพิ่มลิงก์
        </div>

        <!-- Links List -->
        <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
          <div
            v-for="aff in filteredAffiliateLinks"
            :key="aff.id"
            class="flex items-center justify-between p-3 rounded-xl border border-border hover:border-brand/40 bg-surface/30 hover:bg-surface transition-colors"
          >
            <div>
              <p class="text-body-sm font-bold text-text">{{ aff.label }}</p>
              <div class="flex items-center gap-2 mt-0.5 text-caption text-muted">
                <span v-if="aff.merchantName" class="font-medium text-brand">{{
                  aff.merchantName
                }}</span>
                <span v-if="aff.merchantName">·</span>
                <code class="font-mono text-[0.75rem]">/go/{{ aff.slug }}/</code>
              </div>
            </div>
            <button
              type="button"
              class="px-3.5 py-1.5 text-caption font-semibold rounded-full bg-brand text-brand-contrast hover:bg-brand-deep transition-colors cursor-pointer"
              @click="selectAffiliateLink(aff)"
            >
              เลือก
            </button>
          </div>

          <div
            v-if="filteredAffiliateLinks.length === 0"
            class="py-6 text-center text-body-sm text-muted"
          >
            ไม่พบลิงก์ affiliate ที่ตรงกับการค้นหา
          </div>
        </div>

        <!-- Action to remove affiliate link if already active -->
        <div
          v-if="editor?.isActive('affiliateLink')"
          class="pt-3 border-t border-border flex justify-between items-center"
        >
          <span class="text-caption text-muted">ข้อความที่เลือกมีลิงก์ affiliate อยู่แล้ว</span>
          <button
            type="button"
            class="px-3 py-1.5 text-caption font-semibold text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
            @click="removeAffiliateLink"
          >
            ลบลิงก์ affiliate ออก
          </button>
        </div>

        <div class="flex justify-end pt-2 border-t border-border">
          <button
            type="button"
            class="px-4 py-2 rounded-full border border-border text-body-sm font-semibold text-text hover:bg-surface"
            @click="affiliatePickerOpen = false"
          >
            ปิด
          </button>
        </div>
      </div>
    </Modal>

    <!-- Admin Paste Flow Modal Shortcut (AFFILIATE §5, §6) -->
    <Modal
      v-if="showPasteFlowModal"
      :open="showPasteFlowModal"
      title="เพิ่มลิงก์ affiliate ใหม่"
      @update:open="showPasteFlowModal = $event"
    >
      <div class="space-y-4">
        <LinkPasteFlow />
        <div class="flex justify-end pt-3 border-t border-border">
          <button
            type="button"
            class="px-4 py-2 rounded-full border border-border text-body-sm font-semibold text-text hover:bg-surface"
            @click="handlePasteFlowCreated"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
