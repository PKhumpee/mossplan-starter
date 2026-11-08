<script setup lang="ts">
// Showcase for /admin/ui-kit/: every component in the kit, with Thai sample copy.
import { reactive, ref } from 'vue';
import { toast } from '../../../admin-client/toast';
import CategorySelect from '../taxonomy/CategorySelect.vue';
import TagSelect from '../taxonomy/TagSelect.vue';
import MediaPicker from '../media/MediaPicker.vue';
import Badge from './Badge.vue';
import Button from './Button.vue';
import Checkbox from './Checkbox.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import EmptyState from './EmptyState.vue';
import FilterChip from './FilterChip.vue';
import FormField from './FormField.vue';
import Icon from './Icon.vue';
import { ICON_PATHS, type IconName } from './icons';
import Input from './Input.vue';
import Modal from './Modal.vue';
import Select from './Select.vue';
import Skeleton from './Skeleton.vue';
import Spinner from './Spinner.vue';
import Table, { type TableSort } from './Table.vue';
import Tabs from './Tabs.vue';
import Textarea from './Textarea.vue';

const form = reactive({ title: 'ตัวอย่างบทความ', body: '', status: 'draft', agree: true });
const tab = ref('all');
const modalOpen = ref(false);
const confirmOpen = ref(false);
const pickerOpen = ref(false);
const chips = ref(['หมวดหมู่: ข่าว', 'สถานะ: ฉบับร่าง']);
const category = ref<string | null>(null);
const tags = ref<string[]>([]);
const page = ref(1);
const sort = ref<TableSort>({ key: 'title', dir: 'asc' });
const selected = ref<string[]>([]);
const rows = [
  { id: '1', title: 'วิธีเริ่มต้นเขียนบล็อก', status: 'published' },
  { id: '2', title: 'เคล็ดลับ SEO ภาษาไทย', status: 'draft' },
  { id: '3', title: 'สรุปข่าวประจำสัปดาห์', status: 'scheduled' },
];
const columns = [
  { key: 'title', label: 'ชื่อบทความ', sortable: true },
  { key: 'status', label: 'สถานะ' },
];
const icons = Object.keys(ICON_PATHS) as IconName[];
</script>

<template>
  <div class="space-y-10">
    <section class="space-y-3" aria-labelledby="k-buttons">
      <h2 id="k-buttons" class="text-lg font-semibold">ปุ่ม (Button)</h2>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="primary">บันทึก</Button>
        <Button>ยกเลิก</Button>
        <Button variant="ghost">ดูตัวอย่าง</Button>
        <Button variant="danger">ลบบทความ</Button>
        <Button variant="primary" size="sm">ขนาดเล็ก</Button>
        <Button variant="primary" loading>กำลังบันทึก</Button>
        <Button disabled>ปิดใช้งาน</Button>
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="k-forms">
      <h2 id="k-forms" class="text-lg font-semibold">
        ฟอร์ม (Input, Textarea, Select, Checkbox, FormField)
      </h2>
      <div class="grid max-w-xl gap-4">
        <Input v-model="form.title" label="ชื่อบทความ" hint="สั้น กระชับ และตรงประเด็น" required>
          <template #counter>{{ form.title.length }}/60</template>
        </Input>
        <Input
          model-value=""
          label="ลิงก์บทความ (slug)"
          error="ลิงก์นี้ถูกใช้แล้ว ลองเปลี่ยนเป็นชื่ออื่น"
        />
        <Textarea v-model="form.body" label="บทนำสั้น" hint="ประโยคแรกควรตอบคำถามของผู้อ่าน" />
        <Select
          v-model="form.status"
          label="สถานะ"
          :options="[
            { value: 'draft', label: 'ฉบับร่าง' },
            { value: 'scheduled', label: 'ตั้งเวลาเผยแพร่' },
            { value: 'published', label: 'เผยแพร่แล้ว' },
          ]"
        />
        <Checkbox v-model="form.agree" label="อนุญาตให้แสดงชื่อผู้เขียน" />
        <FormField
          label="ช่องแบบกำหนดเอง"
          hint="ใช้กับตัวควบคุมที่ไม่ใช่ input มาตรฐาน"
          v-slot="{ id, describedBy }"
        >
          <input :id="id" :aria-describedby="describedBy" type="range" />
        </FormField>
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="k-status">
      <h2 id="k-status" class="text-lg font-semibold">
        สถานะ (Badge, Spinner, Skeleton, FilterChip)
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <Badge status="draft" /><Badge status="scheduled" /><Badge status="published" /><Badge
          status="failed"
        />
        <Spinner />
      </div>
      <div class="flex flex-wrap gap-2">
        <FilterChip
          v-for="c in chips"
          :key="c"
          :label="c"
          @remove="chips = chips.filter((x) => x !== c)"
        />
      </div>
      <Skeleton :rows="2" />
    </section>

    <section class="space-y-3" aria-labelledby="k-tabs">
      <h2 id="k-tabs" class="text-lg font-semibold">แท็บ (Tabs)</h2>
      <Tabs
        v-model="tab"
        label="กรองตามสถานะ"
        :tabs="[
          { value: 'all', label: 'ทั้งหมด', count: 3 },
          { value: 'draft', label: 'ฉบับร่าง', count: 1 },
          { value: 'published', label: 'เผยแพร่แล้ว', count: 1 },
        ]"
      />
    </section>

    <section class="space-y-3" aria-labelledby="k-table">
      <h2 id="k-table" class="text-lg font-semibold">ตาราง (Table)</h2>
      <Table
        v-model:selected="selected"
        :columns="columns"
        :rows="rows"
        row-key="id"
        caption="รายการบทความตัวอย่าง"
        selectable
        :sort="sort"
        :page="page"
        :total="134"
        @update:sort="sort = $event"
        @update:page="page = $event"
      >
        <template #cell-status="{ row }"><Badge :status="row.status as 'draft'" /></template>
      </Table>
      <Table :columns="columns" :rows="[]" row-key="id" caption="ตารางว่าง">
        <template #empty>
          <EmptyState message="ยังไม่มีบทความ" icon="article">
            <template #action><Button variant="primary">เขียนบทความแรก</Button></template>
          </EmptyState>
        </template>
      </Table>
    </section>

    <section class="space-y-3" aria-labelledby="k-dialogs">
      <h2 id="k-dialogs" class="text-lg font-semibold">
        กล่องโต้ตอบและการแจ้งเตือน (Modal, ConfirmDialog, Toast)
      </h2>
      <div class="flex flex-wrap gap-2">
        <Button @click="modalOpen = true">เปิด Modal</Button>
        <Button variant="danger" @click="confirmOpen = true">ลบบทความ…</Button>
        <Button @click="pickerOpen = true">เลือกรูปภาพ</Button>
        <Button @click="toast.success('บันทึกแล้ว')">Toast สำเร็จ</Button>
        <Button @click="toast.error('บันทึกไม่สำเร็จ ลองอีกครั้ง')">Toast ผิดพลาด</Button>
      </div>
      <Modal v-model:open="modalOpen" title="ตัวอย่างกล่องโต้ตอบ">
        <Input model-value="" label="ชื่อ" />
        <template #footer>
          <Button @click="modalOpen = false">ปิด</Button>
          <Button variant="primary" @click="modalOpen = false">บันทึก</Button>
        </template>
      </Modal>
      <ConfirmDialog
        v-model:open="confirmOpen"
        title="ลบบทความนี้หรือไม่"
        message="บทความจะถูกลบถาวรและกู้คืนไม่ได้"
        confirm-label="ลบบทความ"
        @confirm="confirmOpen = false"
      />
      <MediaPicker v-model:open="pickerOpen" />
    </section>

    <section class="space-y-3" aria-labelledby="k-stubs">
      <h2 id="k-stubs" class="text-lg font-semibold">ตัวเลือกหมวดหมู่และแท็ก (stub สำหรับ T10)</h2>
      <div class="grid max-w-xl gap-4">
        <CategorySelect v-model="category" />
        <TagSelect v-model="tags" />
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="k-icons">
      <h2 id="k-icons" class="text-lg font-semibold">ไอคอน (Icon)</h2>
      <ul class="flex flex-wrap gap-4">
        <li
          v-for="name in icons"
          :key="name"
          class="flex w-24 flex-col items-center gap-1 text-sm text-muted"
        >
          <Icon :name="name" :size="24" />{{ name }}
        </li>
      </ul>
    </section>
  </div>
</template>
