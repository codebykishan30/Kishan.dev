import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowUpRight, Bell, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Code2, FileText, FolderKanban,
  ImagePlus, Inbox, LayoutDashboard, LoaderCircle, LogOut, Menu, MessageSquareText, Moon, PanelLeftClose, PanelLeftOpen,
  Pencil, Plus, Search, Settings, ShieldCheck, Sparkles, Star, Sun, Trash2, UserRound, UsersRound,
  X, Zap,
} from 'lucide-react';
import { requireSupabase, slugify, supabaseConfigured } from '../lib/supabase.js';
import { useAccount } from '../lib/account.js';
import { ManagementMetrics, ReviewsPage, UserDetailPage, UsersPage } from './AdminManagement.jsx';
import ContactRequests from './ContactRequests.jsx';
import './admin.css';

const pageSize = 8;

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  const Icon = toast.type === 'error' ? CircleHelp : CheckCircle2;
  return <div className={`adm-toast ${toast.type}`} role="status"><Icon size={18} /><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss notification"><X size={15} /></button></div>;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, type = 'success') => setToast({ message, type, key: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, notify, dismiss };
}

function SetupScreen() {
  return <main className="adm-login-shell"><section className="adm-login-card">
    <div className="adm-brand-mark"><Code2 size={21} /></div>
    <span className="adm-overline">PORTFOLIO CMS · SETUP REQUIRED</span>
    <h1>Connect your workspace</h1>
    <p>To sign in securely, add your Supabase project URL and publishable anon key to the environment.</p>
    <pre><code>VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…</code></pre>
    <p className="adm-hint">Locally, copy <code>.env.example</code> to <code>.env</code> and restart Vite. On Vercel, add both variables in Project Settings → Environment Variables, then redeploy. Run <code>supabase/schema.sql</code> in your Supabase project.</p>
    <Link className="adm-button adm-button-secondary" to="/">Back to portfolio <ArrowUpRight size={16} /></Link>
  </section></main>;
}

const navigation = [
  { label: 'Workspace', items: [
    { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
    { label: 'Projects', to: '/admin/projects', icon: FolderKanban },
    { label: 'Add project', to: '/admin/projects/new', icon: Plus },
    { label: 'News & articles', to: '/admin/news', icon: FileText },
    { label: 'Write an article', to: '/admin/news/new', icon: Pencil },
    { label: 'Skills', to: '/admin/skills', icon: Zap },
    { label: 'Users', to: '/admin/users', icon: UsersRound },
    { label: 'Reviews', to: '/admin/reviews', icon: Star },
    { label: 'Contact requests', to: '/admin/contact-requests', icon: MessageSquareText },
  ] },
  { label: 'Preferences', items: [
    { label: 'Profile', to: '/admin/profile', icon: UserRound },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ] },
];

function AdminFrame({ user, onLogout, notify, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('portfolio-admin-theme') !== 'light');
  const [newContactCount, setNewContactCount] = useState(0);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => { document.documentElement.dataset.adminTheme = dark ? 'dark' : 'light'; localStorage.setItem('portfolio-admin-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => {
    let active = true;
    const db = requireSupabase();
    const refreshCount = async () => {
      const { count, error } = await db.from('contact_requests').select('id', { count: 'exact', head: true }).eq('status', 'new');
      if (active && !error) setNewContactCount(count || 0);
    };
    refreshCount();
    const channel = db.channel(`admin-contact-badge-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, refreshCount)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [user.id]);
  const currentTitle = navigation.flatMap((group) => group.items).find((item) => item.to === location.pathname || (item.to !== '/admin' && location.pathname.startsWith(`${item.to}/`)))?.label;

  return <div className={`adm-app ${collapsed ? 'is-collapsed' : ''}`}>
    {drawerOpen && <button className="adm-scrim" onClick={() => setDrawerOpen(false)} aria-label="Close navigation" />}
    <aside className={`adm-sidebar ${drawerOpen ? 'open' : ''}`}>
      <Link to="/admin" className="adm-logo"><span className="adm-logo-icon"><Code2 size={20} /></span><span>Studio<span className="adm-logo-dot">.</span><small>PORTFOLIO CMS</small></span></Link>
      <div className="adm-sidebar-label">MANAGE</div>
      {navigation.map((group) => <div className="adm-nav-group" key={group.label}><span className="adm-nav-caption">{group.label}</span>{group.items.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `adm-nav-link${isActive ? ' active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Projects' && <span className="adm-nav-arrow"><ChevronRight size={14} /></span>}{label === 'Contact requests' && newContactCount > 0 && <span className="adm-nav-badge">{newContactCount > 99 ? '99+' : newContactCount}</span>}</NavLink>)}</div>)}
      <div className="adm-sidebar-bottom">
        <div className="adm-help-card"><span className="adm-help-icon"><Sparkles size={16} /></span><b>Make it yours</b><p>Keep your portfolio fresh and up to date.</p><Link to="/admin/settings">Explore settings <ArrowUpRight size={13} /></Link></div>
        <button className="adm-user-card" onClick={onLogout}><span className="adm-avatar">{user.email?.[0]?.toUpperCase() || 'K'}</span><span className="adm-user-copy"><b>{user.user_metadata?.full_name || 'Portfolio admin'}</b><small>{user.email}</small></span><LogOut size={16} /></button>
      </div>
    </aside>

    <div className="adm-main">
      <header className="adm-topbar">
        <button className="adm-icon-button adm-mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <button className="adm-icon-button adm-collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={`${collapsed ? 'Expand' : 'Collapse'} sidebar`}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        <div className="adm-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><b>{currentTitle || 'Dashboard'}</b></div>
        <div className="adm-topbar-actions"><a className="adm-view-site" href="/" target="_blank" rel="noreferrer">View portfolio <ArrowUpRight size={14} /></a><span className="adm-top-divider" /><button className="adm-icon-button" aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><Link className="adm-icon-button adm-notification" to="/admin/contact-requests" aria-label={`${newContactCount} new contact requests`}><Bell size={17} />{newContactCount > 0 && <i />}</Link><span className="adm-avatar adm-avatar-small">{user.email?.[0]?.toUpperCase() || 'K'}</span></div>
      </header>
      <main className="adm-content"><div key={location.pathname} className="adm-page-transition">{children}</div></main>
      <footer className="adm-footer"><span>© {new Date().getFullYear()} Kishan C.</span><span>Made for thoughtful work <span className="adm-footer-heart">✳</span></span><span>PORTFOLIO CMS · V1.0</span></footer>
    </div>
    <Toast toast={notify.toast} onClose={notify.dismiss} />
  </div>;
}

function PageHeader({ eyebrow = 'WORKSPACE', title, subtitle, action }) {
  return <div className="adm-page-header"><div><div className="adm-overline">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Skeleton({ rows = 4 }) {
  return <div className="adm-skeleton-stack" aria-label="Loading"><span className="adm-skeleton adm-skeleton-title" />{Array.from({ length: rows }, (_, index) => <span className="adm-skeleton" key={index} />)}</div>;
}

function EmptyState({ icon: Icon = FolderKanban, title, description, action }) {
  return <div className="adm-empty"><span><Icon size={24} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let active = true;
    setFailure('');
    const db = requireSupabase();
    Promise.all([
      db.from('projects').select('id,title,status,featured,category,created_at,image_url').order('created_at', { ascending: false }),
      db.from('news').select('id,title,status,category,created_at,image_url').order('created_at', { ascending: false }),
      db.from('skills').select('id,name,category').order('name'),
    ]).then((results) => {
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      if (active) setData({ projects: results[0].data || [], news: results[1].data || [], skills: results[2].data || [] });
    }).catch((error) => { if (active) setFailure(errorMessage(error)); });
    return () => { active = false; };
  }, [retryCount]);
  if (failure) return <><PageHeader eyebrow="OVERVIEW · YOUR CREATIVE SPACE" title="Your workspace" subtitle="Here’s what’s happening across your portfolio." /><EmptyState icon={CircleHelp} title="Couldn't load your overview" description={failure} action={<button type="button" className="adm-button adm-button-secondary" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>} /></>;
  if (!data) return <><PageHeader title="Good to see you." subtitle="Here’s what’s happening across your portfolio." /><Skeleton /></>;

  const publishedProjects = data.projects.filter((item) => item.status === 'published').length;
  const publishedNews = data.news.filter((item) => item.status === 'published').length;
  const stats = [
    { label: 'Total projects', value: data.projects.length, icon: FolderKanban, tint: 'violet', foot: `${publishedProjects} published` },
    { label: 'Published projects', value: publishedProjects, icon: CheckCircle2, tint: 'green', foot: `${data.projects.length - publishedProjects} drafts` },
    { label: 'News & articles', value: data.news.length, icon: FileText, tint: 'blue', foot: `${publishedNews} published` },
    { label: 'Technologies', value: data.skills.length, icon: Code2, tint: 'amber', foot: 'Across your skill set' },
  ];
  const activity = [...data.projects.map((item) => ({ ...item, kind: 'Project' })), ...data.news.map((item) => ({ ...item, kind: 'Article' }))]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  return <>
    <PageHeader eyebrow="OVERVIEW · YOUR CREATIVE SPACE" title="Good to see you." subtitle="Here’s what’s happening across your portfolio." />
    <ManagementMetrics />
    <div className="adm-welcome-strip"><span className="adm-welcome-art"><Sparkles size={20} /></span><div><b>Your portfolio, at a glance.</b><p>Publish work and stories to keep your public presence current.</p></div><Link to="/admin/projects/new" className="adm-button adm-button-dark">Add a project <Plus size={16} /></Link></div>
    <section className="adm-stat-grid">{stats.map(({ label, value, icon: Icon, tint, foot }) => <article className="adm-stat-card" key={label}><div className="adm-stat-top"><span>{label}</span><span className={`adm-stat-icon ${tint}`}><Icon size={17} /></span></div><strong>{value.toString().padStart(2, '0')}</strong><div className="adm-stat-foot"><span className="adm-stat-foot-dot" />{foot}</div></article>)}</section>
    <div className="adm-dashboard-grid">
      <section className="adm-panel adm-activity-panel"><div className="adm-panel-heading"><div><span className="adm-overline">YOUR LATEST WORK</span><h2>Recent activity</h2></div><Link className="adm-text-link" to="/admin/projects">View everything <ArrowUpRight size={14} /></Link></div>
        {activity.length ? <div className="adm-activity-list">{activity.map((item) => <div className="adm-activity-row" key={`${item.kind}-${item.id}`}><span className={`adm-activity-icon ${item.kind === 'Project' ? 'project' : 'article'}`}>{item.kind === 'Project' ? <FolderKanban size={16} /> : <FileText size={16} />}</span><Link className="adm-activity-copy" to={`/admin/${item.kind === 'Project' ? 'projects' : 'news'}/${item.id}/edit`} aria-label={`Edit ${item.kind.toLowerCase()}: ${item.title}`}><b>{item.title}</b><small>{item.kind} · {item.category}</small></Link><span className={`adm-status ${item.status}`}>{item.status}</span><time>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div>)}</div> : <EmptyState title="Your activity starts here" description="Create a project or article to see it appear in your recent activity." action={<Link to="/admin/projects/new" className="adm-button adm-button-secondary"><Plus size={15} /> Create project</Link>} />}
      </section>
      <aside className="adm-quick-panel"><div className="adm-panel-heading"><div><span className="adm-overline">GET MOVING</span><h2>Quick actions</h2></div><Zap size={17} /></div><Link className="adm-quick-action" to="/admin/projects/new"><span className="adm-quick-icon violet"><FolderKanban size={17} /></span><span><b>New project</b><small>Show the world what you made</small></span><ChevronRight size={16} /></Link><Link className="adm-quick-action" to="/admin/news/new"><span className="adm-quick-icon blue"><Pencil size={17} /></span><span><b>Write an article</b><small>Share an idea or an update</small></span><ChevronRight size={16} /></Link><Link className="adm-quick-action" to="/admin/skills"><span className="adm-quick-icon green"><Code2 size={17} /></span><span><b>Update skills</b><small>Keep your toolkit current</small></span><ChevronRight size={16} /></Link><div className="adm-quick-tip"><Activity size={15} /><span>Unpublished drafts stay private until you’re ready.</span></div></aside>
    </div>
  </>;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ContentList({ type, notify }) {
  const isProject = type === 'projects';
  const noun = isProject ? 'project' : 'article';
  const Icon = isProject ? FolderKanban : FileText;
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setLoadError('');
    const { data, error } = await requireSupabase().from(type).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    setItems(data || []);
  }, [type]);
  useEffect(() => { refresh().catch((error) => setLoadError(errorMessage(error))); }, [refresh]);

  const categories = useMemo(() => [...new Set((items || []).map((item) => item.category).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...(items || [])].filter((item) => (!term || `${item.title} ${item.category} ${(item.technologies || []).join(' ')}`.toLowerCase().includes(term))
      && (filter === 'all' || item.status === filter)
      && (category === 'all' || item.category === category))
      .sort((a, b) => sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : sort === 'az' ? a.title.localeCompare(b.title) : new Date(b.created_at) - new Date(a.created_at));
  }, [items, query, filter, category, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [query, filter, category, sort]);

  async function remove(item) {
    if (!window.confirm(`Delete “${item.title}”? This action cannot be undone.`)) return;
    try {
      const { error } = await requireSupabase().from(type).delete().eq('id', item.id);
      if (error) throw error;
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      notify(`${isProject ? 'Project' : 'Article'} deleted successfully`);
    } catch (error) {
      notify(`Unable to delete ${noun}: ${errorMessage(error)}`, 'error');
    }
  }
  async function togglePublish(item) {
    const status = item.status === 'published' ? 'draft' : 'published';
    const payload = { status, updated_at: new Date().toISOString(), ...(isProject ? {} : { published_at: status === 'published' ? new Date().toISOString() : item.published_at }) };
    try {
      const { data, error } = await requireSupabase().from(type).update(payload).eq('id', item.id).select().single();
      if (error) throw error;
      setItems((current) => current.map((entry) => entry.id === item.id ? data : entry));
      notify(`${isProject ? 'Project' : 'Article'} ${status === 'published' ? 'published' : 'moved to drafts'}`);
    } catch (error) {
      notify(`Unable to update ${noun}: ${errorMessage(error)}`, 'error');
    }
  }

  return <>
    <PageHeader eyebrow={isProject ? 'YOUR WORK · MANAGE PROJECTS' : 'YOUR WRITING · MANAGE ARTICLES'} title={isProject ? 'Projects' : 'News & articles'} subtitle={isProject ? 'Manage your portfolio projects and choose what to share publicly.' : 'Draft, edit, and publish stories for your portfolio.'} action={<Link className="adm-button adm-button-primary" to={`/admin/${type}/new`}><Plus size={17} />{isProject ? 'Add project' : 'Write article'}</Link>} />
    <div className="adm-list-toolbar"><label className="adm-search"><Search size={17} /><input type="search" placeholder={`Search ${type}…`} value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><div className="adm-filter-group"><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by publication status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select><select aria-label="Sort content" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="az">Title A–Z</option></select></div></div>
    <section className="adm-panel adm-table-panel">
      {loadError ? <EmptyState icon={CircleHelp} title="Couldn't load content" description={loadError} action={<button className="adm-button adm-button-secondary" onClick={() => refresh().catch((error) => setLoadError(errorMessage(error)))}>Try again</button>} /> : !items ? <Skeleton rows={5} /> : items.length === 0 ? <EmptyState icon={Icon} title={`No ${type} yet`} description={`Create your first ${noun} to start building your portfolio.`} action={<Link className="adm-button adm-button-primary" to={`/admin/${type}/new`}><Plus size={16} />{isProject ? 'Add project' : 'Write article'}</Link>} /> : visible.length === 0 ? <EmptyState icon={Search} title="Nothing matches those filters" description="Try a different search or clear one of the filters." action={<button className="adm-button adm-button-secondary" onClick={() => { setQuery(''); setFilter('all'); setCategory('all'); }}>Clear filters</button>} /> : <>
        <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>{isProject ? 'PROJECT' : 'ARTICLE'}</th><th>CATEGORY</th>{isProject && <th>TECHNOLOGIES</th>}<th>STATUS</th>{isProject && <th>FEATURED</th>}<th>{isProject ? 'PROJECT DATE' : 'PUBLISHED'}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}>
          <td><div className="adm-item-cell">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="adm-item-placeholder"><Icon size={17} /></span>}<div><b>{item.title}</b><small>{item.slug}</small></div></div></td><td><span className="adm-category-pill">{item.category}</span></td>{isProject && <td><div className="adm-tech-cell">{(item.technologies || []).slice(0, 3).map((tech) => <span key={tech}>{tech}</span>)}{(item.technologies || []).length > 3 && <small>+{item.technologies.length - 3}</small>}</div></td>}<td><button className={`adm-status ${item.status} adm-status-button`} onClick={() => togglePublish(item)} title={`Click to ${item.status === 'published' ? 'unpublish' : 'publish'}`}>{item.status === 'published' ? <Check size={12} /> : <Clock3 size={12} />}{item.status}</button></td>{isProject && <td>{item.featured ? <span className="adm-featured"><Sparkles size={13} /> Featured</span> : <span className="adm-dash">—</span>}</td>}<td className="adm-date-cell">{formatDate(isProject ? item.project_date : item.published_at)}</td><td><div className="adm-row-actions"><button className="adm-icon-button" onClick={() => navigate(`/admin/${type}/${item.id}/edit`)} title={`Edit ${item.title}`}><Pencil size={15} /></button><button className="adm-icon-button danger" onClick={() => remove(item)} title={`Delete ${item.title}`}><Trash2 size={15} /></button></div></td>
        </tr>)}</tbody></table></div>
        <div className="adm-pagination"><span>Showing <b>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)}</b> of <b>{filtered.length}</b> {type}</span><div><button className="adm-icon-button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page <b>{page}</b> of <b>{pageCount}</b></span><button className="adm-icon-button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
      </>}
    </section>
    <Toast toast={null} onClose={() => {}} />
  </>;
}

const emptyProject = { title: '', short_description: '', description: '', image_url: '', technologies: [], category: '', github_url: '', live_url: '', project_date: new Date().toISOString().slice(0, 10), featured: false, status: 'draft' };
const emptyNews = { title: '', summary: '', content: '', image_url: '', category: '', author: '', published_at: new Date().toISOString().slice(0, 10), status: 'draft' };

function ContentEditor({ type, notify }) {
  const isProject = type === 'projects';
  const noun = isProject ? 'project' : 'article';
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [techInput, setTechInput] = useState('');
  const [pending, setPending] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) { setForm({ ...(isProject ? emptyProject : emptyNews) }); return; }
      const { data, error } = await requireSupabase().from(type).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`This ${noun} was not found.`);
      if (active) setForm({ ...(isProject ? emptyProject : emptyNews), ...data });
    }
    load().catch((error) => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, isProject, noun, type]);

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  async function uploadImage(file) {
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) { setImageError('Choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('Image must be smaller than 5 MB.'); return; }
    setImageBusy(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${type}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await requireSupabase().storage.from('portfolio-media').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: publicUrl } = requireSupabase().storage.from('portfolio-media').getPublicUrl(data.path);
      update('image_url', publicUrl.publicUrl);
    } catch (error) {
      setImageError(`Unable to upload image: ${errorMessage(error)}`);
    } finally {
      setImageBusy(false);
    }
  }
  function addTechnologies(event) {
    event.preventDefault();
    const additions = techInput.split(',').map((value) => value.trim()).filter(Boolean);
    update('technologies', [...new Set([...(form.technologies || []), ...additions])]);
    setTechInput('');
  }
  async function submit(event) {
    event.preventDefault();
    const saveForm = event.nativeEvent.submitter?.dataset.status === 'draft'
      ? { ...form, status: 'draft' }
      : form;
    setPending(true);
    const now = new Date().toISOString();
    const payload = {
      ...saveForm,
      slug: slugify(saveForm.title),
      updated_at: now,
      ...(isProject ? {
        technologies: saveForm.technologies || [],
        project_date: saveForm.project_date || null,
      } : {
        published_at: saveForm.status === 'published' ? (saveForm.published_at ? new Date(saveForm.published_at).toISOString() : now) : null,
      }),
    };
    if (!payload.slug) { notify('Please enter a title before saving.', 'error'); setPending(false); return; }
    try {
      const request = editing
        ? requireSupabase().from(type).update(payload).eq('id', id)
        : requireSupabase().from(type).insert(payload);
      const { error } = await request;
      if (error) throw error;
    } catch (error) {
      setPending(false);
      notify(`Unable to save ${noun}: ${errorMessage(error)}`, 'error');
      return;
    }
    setPending(false);
    notify(`${isProject ? 'Project' : 'Article'} ${editing ? 'updated' : 'added'} successfully`);
    navigate(`/admin/${type}`);
  }

  if (loadError) return <EmptyState icon={CircleHelp} title="Couldn't open this editor" description={loadError} action={<Link className="adm-button adm-button-secondary" to={`/admin/${type}`}>Back to {type}</Link>} />;
  if (!form) return <><PageHeader title={editing ? `Edit ${noun}` : `Create ${noun}`} subtitle="Loading your content…" /><Skeleton rows={5} /></>;

  return <>
    <PageHeader eyebrow={editing ? `EDIT · ${noun.toUpperCase()}` : `CREATE · ${noun.toUpperCase()}`} title={editing ? `Edit ${isProject ? 'project' : 'article'}` : isProject ? 'New project' : 'Write an article'} subtitle={isProject ? 'Add the details that make this work easy to discover.' : 'Capture your story, polish it, and publish when you’re ready.'} action={<button className="adm-button adm-button-secondary" onClick={() => navigate(`/admin/${type}`)}><ChevronLeft size={16} /> Back to {isProject ? 'projects' : 'articles'}</button>} />
    <form id="admin-content-form" className="adm-editor-grid" onSubmit={submit}>
      <div className="adm-editor-main adm-panel">
        <div className="adm-form-section"><div className="adm-form-section-title"><span>01</span><div><h2>{isProject ? 'The essentials' : 'Your story'}</h2><p>Start with the details people will see first.</p></div></div>
          <label className="adm-field">{isProject ? 'Project title' : 'Article title'}<input required maxLength={120} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={isProject ? 'e.g. Atlas design system' : 'A title that makes people curious'} /></label>
          <label className="adm-field">{isProject ? 'Short description' : 'Summary'}<textarea required rows={3} maxLength={isProject ? 220 : 280} value={isProject ? form.short_description : form.summary} onChange={(event) => update(isProject ? 'short_description' : 'summary', event.target.value)} placeholder={isProject ? 'A crisp overview of what you built and why.' : 'Give readers a preview of your article…'} /><small className="adm-character-count">{(isProject ? form.short_description : form.summary).length} / {isProject ? 220 : 280}</small></label>
          <label className="adm-field">{isProject ? 'Detailed description' : 'Article content'}<textarea required rows={isProject ? 8 : 14} value={isProject ? form.description : form.content} onChange={(event) => update(isProject ? 'description' : 'content', event.target.value)} placeholder={isProject ? 'Tell the full story: the challenge, your approach, and the outcome.' : 'Start writing your article here…'} /></label>
        </div>
        <div className="adm-form-section"><div className="adm-form-section-title"><span>02</span><div><h2>Presentation</h2><p>Help your content stand out in the portfolio.</p></div></div>
          <div className="adm-field"><span className="adm-label">{isProject ? 'Project thumbnail' : 'Featured image'}</span><span className="adm-field-help">JPG, PNG, WebP or AVIF · Up to 5 MB</span><label className={`adm-upload-area ${form.image_url ? 'has-image' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadImage(event.target.files?.[0])} /><span className="adm-upload-preview">{form.image_url ? <img src={form.image_url} alt="Selected cover preview" /> : imageBusy ? <LoaderCircle className="spin" size={21} /> : <ImagePlus size={22} />}</span><span><b>{imageBusy ? 'Uploading image…' : form.image_url ? 'Replace image' : 'Click to upload an image'}</b><small>{form.image_url ? 'Preview updates after upload' : 'or drag and drop an image here'}</small></span>{form.image_url && <CheckCircle2 className="adm-upload-check" size={18} />}</label>{imageError && <small className="adm-field-error">{imageError}</small>}</div>
          <div className="adm-form-two"><label className="adm-field">Category<input required maxLength={60} value={form.category} onChange={(event) => update('category', event.target.value)} placeholder={isProject ? 'Web development' : 'Engineering'} /></label>{isProject ? <label className="adm-field">Project date<input type="date" value={form.project_date || ''} onChange={(event) => update('project_date', event.target.value)} /></label> : <label className="adm-field">Author<input required value={form.author} onChange={(event) => update('author', event.target.value)} placeholder="Your name" /></label>}</div>
          {isProject && <div className="adm-field"><span className="adm-label">Technologies</span><div className="adm-tech-form"><input value={techInput} onChange={(event) => setTechInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTechnologies(event); } }} placeholder="React, TypeScript, Supabase" aria-label="Add technologies separated by commas" /><button type="button" className="adm-button adm-button-secondary" onClick={addTechnologies}><Plus size={15} /> Add</button></div><div className="adm-selected-tech">{(form.technologies || []).map((tech) => <button type="button" key={tech} onClick={() => update('technologies', form.technologies.filter((value) => value !== tech))}>{tech}<X size={12} /></button>)}</div></div>}
        </div>
      </div>
      <aside className="adm-editor-side">
        <section className="adm-panel adm-publish-card"><div className="adm-side-card-heading"><span className="adm-overline">PUBLISHING</span><span className={`adm-status ${form.status}`}>{form.status}</span></div><h3>Ready to share?</h3><p>{form.status === 'published' ? 'This content is visible on your public portfolio.' : 'Save this as a private draft or publish it to your portfolio.'}</p><div className="adm-status-switch"><label htmlFor="publish-status">Publicly visible</label><button id="publish-status" type="button" role="switch" aria-checked={form.status === 'published'} className={`adm-switch ${form.status === 'published' ? 'on' : ''}`} onClick={() => update('status', form.status === 'published' ? 'draft' : 'published')}><span /></button></div>{isProject && <div className="adm-status-switch"><label htmlFor="featured-status"><Sparkles size={14} /> Featured project</label><button id="featured-status" type="button" role="switch" aria-checked={form.featured} className={`adm-switch ${form.featured ? 'on' : ''}`} onClick={() => update('featured', !form.featured)}><span /></button></div>}<button className="adm-button adm-button-primary adm-save-button" type="submit" form="admin-content-form" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{pending ? 'Saving…' : `Save ${noun}`}</button><button className="adm-save-draft" type="submit" form="admin-content-form" data-status="draft" disabled={pending}>Save as draft</button></section>
        <section className="adm-panel adm-links-card"><span className="adm-overline">{isProject ? 'PROJECT LINKS' : 'PUBLISH DATE'}</span>{isProject ? <><label className="adm-field">GitHub repository<input type="url" value={form.github_url || ''} onChange={(event) => update('github_url', event.target.value)} placeholder="https://github.com/…" /></label><label className="adm-field">Live demo<input type="url" value={form.live_url || ''} onChange={(event) => update('live_url', event.target.value)} placeholder="https://your-project.com" /></label></> : <label className="adm-field">Publication date<input type="date" value={form.published_at?.slice(0, 10) || ''} onChange={(event) => update('published_at', event.target.value)} /></label>}</section>
      </aside>
    </form>
  </>;
}

function Skills({ notify }) {
  const [skills, setSkills] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', category: '', icon: '', proficiency: 3 });
  const [editingId, setEditingId] = useState(null);
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => { const { data, error: requestError } = await requireSupabase().from('skills').select('*').order('category').order('name'); if (requestError) throw requestError; setSkills(data || []); }, []);
  useEffect(() => { load().catch((err) => setError(errorMessage(err))); }, [load]);
  async function save(event) {
    event.preventDefault(); setPending(true);
    const request = editingId ? requireSupabase().from('skills').update(form).eq('id', editingId) : requireSupabase().from('skills').insert(form);
    const { error: saveError } = await request; setPending(false);
    if (saveError) { notify(`Unable to save skill: ${saveError.message}`, 'error'); return; }
    notify(`Skill ${editingId ? 'updated' : 'added'} successfully`); setForm({ name: '', category: '', icon: '', proficiency: 3 }); setEditingId(null);
    load().catch((err) => setError(errorMessage(err)));
  }

  async function remove(skill) {
    if (!window.confirm(`Delete ${skill.name} from your skills?`)) return;
    const { error: deleteError } = await requireSupabase().from('skills').delete().eq('id', skill.id);
    if (deleteError) { notify(`Unable to delete skill: ${deleteError.message}`, 'error'); return; }
    setSkills((current) => current.filter((item) => item.id !== skill.id)); notify('Skill deleted successfully');
  }
  return <>
    <PageHeader eyebrow="YOUR TOOLKIT · MANAGE SKILLS" title="Skills & technologies" subtitle="Show visitors the tools and technologies you work with." />
    {error ? <EmptyState icon={CircleHelp} title="Couldn't load skills" description={error} action={<button className="adm-button adm-button-secondary" onClick={() => load().catch((err) => setError(errorMessage(err)))}>Try again</button>} /> : <div className="adm-skills-layout">
      <section className="adm-panel adm-skill-form-panel"><span className="adm-overline">{editingId ? 'EDIT SKILL' : 'ADD TO YOUR TOOLKIT'}</span><h2>{editingId ? 'Update skill' : 'Add a skill'}</h2><p>Group technologies into clear categories for your portfolio.</p><form className="adm-form" onSubmit={save}><label className="adm-field">Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. React" /></label><label className="adm-field">Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Frontend" /></label><label className="adm-field">Icon name <span className="adm-field-help">Optional Lucide icon name</span><input value={form.icon || ''} onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="Code2" /></label><label className="adm-field">Proficiency <select value={form.proficiency} onChange={(event) => setForm({ ...form, proficiency: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((num) => <option value={num} key={num}>{num} / 5</option>)}</select></label><button className="adm-button adm-button-primary" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{editingId ? 'Update skill' : 'Add skill'}</button>{editingId && <button type="button" className="adm-save-draft" onClick={() => { setForm({ name: '', category: '', icon: '', proficiency: 3 }); setEditingId(null); }}>Cancel editing</button>}</form></section>
      <section className="adm-panel adm-skills-panel"><div className="adm-panel-heading"><div><span className="adm-overline">PORTFOLIO TOOLKIT</span><h2>Your skills <span className="adm-count-badge">{skills?.length ?? '…'}</span></h2></div><Code2 size={18} /></div>{!skills ? <Skeleton rows={4} /> : skills.length ? <div className="adm-skill-list">{skills.map((skill) => <div className="adm-skill-row" key={skill.id}><span className="adm-quick-icon green"><Code2 size={16} /></span><div className="adm-skill-copy"><b>{skill.name}</b><small>{skill.category}</small></div><div className="adm-proficiency" aria-label={`Proficiency ${skill.proficiency} out of 5`}>{[1, 2, 3, 4, 5].map((num) => <i key={num} className={num <= skill.proficiency ? 'filled' : ''} />)}</div><button className="adm-icon-button" title={`Edit ${skill.name}`} onClick={() => { setForm({ name: skill.name, category: skill.category, icon: skill.icon || '', proficiency: skill.proficiency }); setEditingId(skill.id); }}><Pencil size={14} /></button><button className="adm-icon-button danger" title={`Delete ${skill.name}`} onClick={() => remove(skill)}><Trash2 size={14} /></button></div>)}</div> : <EmptyState icon={Code2} title="No skills added" description="Add a technology to get started." />}</section>
    </div>}
  </>;
}

function Profile({ user }) {
  return <><PageHeader eyebrow="ACCOUNT · YOUR DETAILS" title="Profile" subtitle="Your admin account and portfolio identity." /><div className="adm-profile-grid"><section className="adm-panel adm-profile-card"><span className="adm-avatar adm-profile-avatar">{user.email?.[0]?.toUpperCase() || 'K'}</span><span className="adm-overline">ADMINISTRATOR</span><h2>{user.user_metadata?.full_name || 'Portfolio admin'}</h2><p>{user.email}</p><span className="adm-profile-verified"><ShieldCheck size={15} />Authenticated with Supabase</span></section><section className="adm-panel adm-profile-info"><span className="adm-overline">ACCOUNT INFORMATION</span><div><span>Email address</span><b>{user.email}</b></div><div><span>Account created</span><b>{formatDate(user.created_at)}</b></div><div><span>Last sign in</span><b>{formatDate(user.last_sign_in_at)}</b></div><div><span>Access level</span><b className="adm-profile-verified"><ShieldCheck size={15} /> Administrator</b></div><p>To update credentials or administrator access, use Supabase Authentication in your project dashboard.</p></section></div></>;
}

function SettingsPage() {
  const [dark, setDark] = useState(() => localStorage.getItem('portfolio-admin-theme') !== 'light');
  return <><PageHeader eyebrow="PREFERENCES · PERSONALIZE" title="Settings" subtitle="Tune your workspace to feel like your own." /><section className="adm-panel adm-settings-panel"><div className="adm-settings-row"><span className="adm-quick-icon violet">{dark ? <Moon size={17} /> : <Sun size={17} />}</span><div><b>Appearance</b><p>Choose a comfortable theme for your workspace.</p></div><select aria-label="Appearance theme" value={dark ? 'dark' : 'light'} onChange={(event) => { const next = event.target.value === 'dark'; setDark(next); document.documentElement.dataset.adminTheme = next ? 'dark' : 'light'; localStorage.setItem('portfolio-admin-theme', next ? 'dark' : 'light'); }}><option value="dark">Dark</option><option value="light">Light</option></select></div><div className="adm-settings-row"><span className="adm-quick-icon green"><ShieldCheck size={17} /></span><div><b>Authentication & access</b><p>Sign-in and administrator privileges are managed securely by Supabase.</p></div><span className="adm-settings-readonly">Protected</span></div><div className="adm-settings-row"><span className="adm-quick-icon blue"><ImagePlus size={17} /></span><div><b>Media uploads</b><p>Portfolio images use the private admin policies on the public portfolio-media bucket.</p></div><span className="adm-settings-readonly">5 MB max</span></div></section></>;
}

export default function AdminApp() {
  const account = useAccount();
  const notify = useToast();
  const location = useLocation();

  if (!supabaseConfigured) return <SetupScreen />;
  if (account.status === 'loading') return <main className="adm-login-shell"><div className="adm-login-card"><LoaderCircle className="spin" size={24} /><p>Verifying your access…</p></div></main>;
  // Not signed in: everyone uses the single shared sign-in page.
  if (!account.session) return <Navigate to="/signin" replace state={{ from: location }} />;
  // Signed in, but the profile role could not be confirmed or is not an admin.
  // The dashboard is never rendered, so hiding the navigation link is not the
  // only protection.
  if (account.status !== 'ready' || account.role !== 'admin') return <Navigate to="/" replace />;

  async function logout() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) notify.notify(`Unable to sign out: ${error.message}`, 'error');
  }

  return <AdminFrame user={account.session.user} onLogout={logout} notify={notify}><Routes>
    <Route index element={<Dashboard />} />
    <Route path="projects" element={<ContentList type="projects" notify={notify.notify} />} />
    <Route path="projects/new" element={<ContentEditor type="projects" notify={notify.notify} />} />
    <Route path="projects/:id/edit" element={<ContentEditor type="projects" notify={notify.notify} />} />
    <Route path="news" element={<ContentList type="news" notify={notify.notify} />} />
    <Route path="news/new" element={<ContentEditor type="news" notify={notify.notify} />} />
    <Route path="news/:id/edit" element={<ContentEditor type="news" notify={notify.notify} />} />
    <Route path="skills" element={<Skills notify={notify.notify} />} />
    <Route path="users" element={<UsersPage />} />
    <Route path="users/:id" element={<UserDetailPage notify={notify.notify} />} />
    <Route path="reviews" element={<ReviewsPage notify={notify.notify} />} />
    <Route path="contact-requests" element={<ContactRequests notify={notify.notify} />} />
    <Route path="profile" element={<Profile user={account.session.user} />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes></AdminFrame>;
}
