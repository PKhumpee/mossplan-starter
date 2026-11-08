// Island bootstrap pattern for the admin.
//
// Every interactive admin screen is one Vue 3 component mounted from an SSR `.astro` page:
//
//   ---
//   import AdminLayout from '../../layouts/AdminLayout.astro';
//   import ArticleList from '../../components/admin/articles/ArticleList.vue';
//   export const prerender = false;
//   ---
//   <AdminLayout title="บทความ" active="articles">
//     <ArticleList client:only="vue" />
//   </AdminLayout>
//
// - `client:only="vue"`: admin screens need the signed-in session, so they are never server-rendered.
// - Fetch data in the component with `api` (below); it unwraps `{ data }` and throws `ApiError`.
// - Report outcomes with `toast`; `AdminLayout` already hosts the single toast container.
// - Admin JS is only ever imported from admin pages, so public pages ship none of it (AGENTS.md).
export { api, ApiError, redirectToLogin, LOGIN_PATH } from './api';
export type { ApiOptions } from './api';
export { toast, toasts, dismissToast } from './toast';
