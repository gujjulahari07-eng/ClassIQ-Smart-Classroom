import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Link, Route, Switch, useLocation } from 'wouter';
import { setAuthTokenGetter, useAskClassroomAssistant } from '@workspace/api-client-react';
import {
  Activity, AlertTriangle, ArrowRight, Bell, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cpu, DoorOpen, Gauge, GraduationCap, LayoutDashboard, LogOut, Menu, Moon, Plus, Search, Send, Settings, ShieldCheck, Sun, Users, Wrench, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
if (supabase) {
  const client = supabase;
  setAuthTokenGetter(async () => {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  });
} else {
  setAuthTokenGetter(null);
}

type Row = Record<string, any>;
type TableState = { data: Row[]; loading: boolean; error: string | null; refresh: () => void };
type CampusRole = 'ADMIN' | 'FACULTY' | 'MAINTENANCE' | 'STUDENT' | 'GUEST';
const RoleContext = createContext<CampusRole>('GUEST');
const AuthVersionContext = createContext(0);
const RealtimeContext = createContext((_table: string, _connected: boolean) => {});
function useTable(table: string): TableState {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [channelVersion, setChannelVersion] = useState(0);
  const channelId = useId();
  const sessionVersion = useContext(AuthVersionContext);
  const markRealtime = useContext(RealtimeContext);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData([]);
    if (!supabase) { setLoading(false); setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to connect live campus data.'); return; }
    supabase.from(table).select('*').limit(500).then(({ data: rows, error: queryError }) => {
      if (!active) return;
      if (queryError) { setData([]); setError(queryError.message); }
      else setData((rows ?? []) as Row[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [table, version, sessionVersion]);
  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    if (!supabase) { markRealtime(table, false); return; }
    const channel = supabase.channel(`classiq-live-${table}-${channelId.replaceAll(':', '-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => setVersion((v) => v + 1))
      .subscribe((status, subscriptionError) => {
        if (!active) return;
        markRealtime(table, status === 'SUBSCRIBED');
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && retryTimer === undefined) {
          if (/401|invalid api key|unauthorized/i.test(subscriptionError?.message ?? '')) {
            setError('Supabase rejected the configured API key.');
            setLoading(false);
            return;
          }
          retryTimer = window.setTimeout(() => { if (active) { setVersion((v) => v + 1); setChannelVersion((v) => v + 1); } }, 2500);
        }
      });
    return () => { active = false; if (retryTimer !== undefined) window.clearTimeout(retryTimer); markRealtime(table, false); void supabase?.removeChannel(channel); };
  }, [table, channelId, channelVersion, markRealtime]);
  return { data, loading, error, refresh: () => setVersion((v) => v + 1) };
}

const navGroups: { title: string; items: [string, string, LucideIcon][] }[] = [
  { title: 'CAMPUS VIEW', items: [['Dashboard', '/dashboard', LayoutDashboard], ['Classrooms', '/classrooms', DoorOpen], ['Devices', '/devices', Cpu], ['Digital twin', '/digital-twin', Building2]] },
  { title: 'ACADEMICS', items: [['Timetable', '/timetable', CalendarDays], ['Attendance', '/attendance', GraduationCap]] },
  { title: 'OPERATIONS', items: [['Energy', '/energy', Zap], ['Analytics', '/analytics', Activity], ['Maintenance', '/maintenance', Wrench], ['Alerts', '/alerts', Bell]] },
  { title: 'ADMINISTRATION', items: [['AI assistant', '/ai-assistant', CircleHelp], ['Users & roles', '/users', Users], ['Audit logs', '/audit-logs', ShieldCheck], ['Settings', '/settings', Settings]] },
];
const navAccess: Record<CampusRole, string[]> = {
  ADMIN: ['/dashboard', '/classrooms', '/devices', '/digital-twin', '/timetable', '/attendance', '/energy', '/analytics', '/maintenance', '/alerts', '/ai-assistant', '/users', '/audit-logs', '/settings'],
  FACULTY: ['/dashboard', '/classrooms', '/devices', '/digital-twin', '/timetable', '/attendance', '/energy', '/analytics', '/alerts', '/ai-assistant', '/settings'],
  MAINTENANCE: ['/dashboard', '/classrooms', '/devices', '/digital-twin', '/energy', '/maintenance', '/alerts', '/settings'],
  STUDENT: ['/dashboard', '/classrooms', '/timetable', '/attendance', '/settings'],
  GUEST: ['/dashboard', '/classrooms', '/settings'],
};
const pageConfig: Record<string, { title: string; eyebrow: string; description: string; table: string; icon: LucideIcon }> = {
  '/classrooms': { title: 'Classrooms', eyebrow: 'CAMPUS DIRECTORY', description: 'Room readiness, capacity and operational state across your campus.', table: 'classrooms', icon: DoorOpen },
  '/devices': { title: 'Devices', eyebrow: 'CONNECTED EQUIPMENT', description: 'Connected classroom equipment and its current health.', table: 'devices', icon: Cpu },
  '/timetable': { title: 'Timetable', eyebrow: 'ACADEMIC OPERATIONS', description: 'Scheduled teaching sessions across rooms and faculty.', table: 'timetable', icon: CalendarDays },
  '/attendance': { title: 'Attendance', eyebrow: 'STUDENT RECORDS', description: 'Attendance records from the connected campus system.', table: 'attendance', icon: GraduationCap },
  '/energy': { title: 'Energy', eyebrow: 'RESOURCE MONITORING', description: 'Metered energy use and estimated cost from live readings.', table: 'energy_readings', icon: Zap },
  '/analytics': { title: 'Analytics', eyebrow: 'CAMPUS INTELLIGENCE', description: 'Comparisons and forecasts based only on available recorded data.', table: 'ai_insights', icon: Activity },
  '/maintenance': { title: 'Maintenance', eyebrow: 'FACILITIES WORK QUEUE', description: 'Equipment issues and service tickets that need attention.', table: 'maintenance_tickets', icon: Wrench },
  '/alerts': { title: 'Alerts', eyebrow: 'LIVE OPERATIONS', description: 'Signals requiring a campus operator’s attention.', table: 'alerts', icon: Bell },
  '/digital-twin': { title: 'Digital twin', eyebrow: 'BUILDING STATUS', description: 'A live inventory of buildings, rooms and their reported state.', table: 'buildings', icon: Building2 },
  '/users': { title: 'Users & roles', eyebrow: 'ACCESS DIRECTORY', description: 'Profiles and campus roles managed in Supabase.', table: 'profiles', icon: Users },
  '/audit-logs': { title: 'Audit logs', eyebrow: 'ACCOUNTABILITY', description: 'Recorded actions from the connected application data.', table: 'audit_logs', icon: ShieldCheck },
};
const pretty = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value).replaceAll('_', ' ');
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('classiq-theme') === 'dark');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('classiq-theme', dark ? 'dark' : 'light'); }, [dark]);
  return <button data-testid="button-theme-toggle" aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} onClick={() => setDark(!dark)} className="icon-button">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<CampusRole>('GUEST');
  const [sessionVersion, setSessionVersion] = useState(0);
  const [liveTables, setLiveTables] = useState<Record<string, boolean>>({});
  const markRealtime = useCallback((table: string, connected: boolean) => {
    setLiveTables((current) => current[table] === connected ? current : { ...current, [table]: connected });
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const client = supabase;
    const readRole = async (userId: string) => {
      const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (!active) return;
      const candidate = String(data?.role ?? 'STUDENT').toUpperCase();
      setRole(['ADMIN', 'FACULTY', 'MAINTENANCE', 'STUDENT'].includes(candidate) ? candidate as CampusRole : 'STUDENT');
    };
    const syncSession = (session: any) => {
      setSessionVersion((value) => value + 1);
      setUser(session?.user ?? null);
      if (!session?.user?.id) { setRole('GUEST'); return; }
      window.setTimeout(() => { if (active) void readRole(session.user.id); }, 0);
    };
    void client.auth.getSession().then(({ data }) => syncSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => syncSession(session));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const logout = async () => { await supabase?.auth.signOut(); };
  const visibleGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => navAccess[role].includes(item[1])) })).filter((group) => group.items.length > 0);
  const activeLabel = visibleGroups.flatMap((g) => g.items).find((item) => item[1] === location)?.[0] ?? 'ClassIQ';
  const realtimeConnected = Object.values(liveTables).some(Boolean);
  return <AuthVersionContext.Provider value={sessionVersion}><RealtimeContext.Provider value={markRealtime}><RoleContext.Provider value={role}><div className="app-shell grain">
    {open && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} data-testid="button-close-mobile-nav" />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <Link href="/dashboard" className="brand" data-testid="link-brand"><span className="brand-mark"><span /></span><span>class<span className="brand-iq">IQ</span><small>CAMPUS OPERATIONS</small></span></Link>
      <div className="campus-chip"><span className="campus-dot" /><div><b>Campus network</b><small>Live operations view</small></div><ChevronDown size={14} /></div>
      <nav className="nav-scroll" aria-label="Primary navigation">
        {visibleGroups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{group.title}</div>{group.items.map(([label, href, Icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} className={`nav-link ${location === href ? 'nav-active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{href === '/alerts' && <span className="nav-indicator" />}</Link>)}</div>)}
      </nav>
      <div className="sidebar-foot">
        <div className="connection-status"><span className={`status-dot ${supabase ? 'dot-green' : 'dot-amber'}`} /><span>{supabase ? 'Data connection configured' : 'Setup required'}</span></div>
        <div className="profile-row"><div className="avatar">{user?.email?.slice(0, 1).toUpperCase() ?? 'C'}</div><div className="profile-info"><b>{user?.user_metadata?.full_name ?? user?.email ?? 'Campus operator'}</b><small>{user ? role : 'Guest session'}</small></div>{user ? <button className="subtle-icon" onClick={logout} aria-label="Sign out" data-testid="button-sign-out"><LogOut size={16} /></button> : <Link className="subtle-icon" href="/login" aria-label="Sign in" data-testid="link-sign-in"><ArrowRight size={16} /></Link>}</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-open-mobile-nav"><Menu size={19} /></button><span className="crumb">Operations</span><ChevronRight size={14} className="crumb-chevron" /><span className="crumb-current">{activeLabel}</span></div><div className="topbar-actions"><span className={`live-pill ${realtimeConnected ? 'live-connected' : 'live-connecting'}`} aria-live="polite" data-testid="status-realtime"><span />{realtimeConnected ? 'LIVE SYNC' : 'CONNECTING'}</span><ThemeToggle /><Link href="/alerts" className="icon-button notification-link" aria-label="Alerts" data-testid="link-header-alerts"><Bell size={17} /></Link><div className="top-date">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</div></div></header>
      <div className="content-wrap">{children}</div>
      <footer className="app-footer"><span>CLASSIQ CAMPUS OPERATIONS</span><span>Data is sourced from your connected Supabase project.</span></footer>
    </main>
  </div></RoleContext.Provider></RealtimeContext.Provider></AuthVersionContext.Provider>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading fade-in"><div><div className="eyebrow">{eyebrow}</div><h1 className="serif" data-testid={`heading-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function EmptyState({ table, refresh }: { table: string; refresh: () => void }) {
  return <div className="state-box" data-testid={`empty-${table}`}><div className="state-icon"><Building2 size={20} /></div><h3>No connected records yet</h3><p>The <span className="mono">{table}</span> table returned no records. ClassIQ won’t fill this view with sample data.</p><button className="button button-quiet" onClick={refresh} data-testid={`button-refresh-${table}`}>Refresh data <Activity size={15} /></button></div>;
}
function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  const displayMessage = /invalid api key|invalid apikey|api key.*invalid/i.test(message)
    ? 'Supabase rejected this key. Confirm the URL and publishable or anon key belong to the same project, and use a public key—not a service-role key.'
    : message;
  return <div className="state-box error-state" data-testid="state-data-error"><div className="state-icon"><AlertTriangle size={20} /></div><h3>Live data unavailable</h3><p>{displayMessage}</p><button className="button button-quiet" onClick={retry} data-testid="button-retry-data">Try again <ArrowRight size={15} /></button></div>;
}
function SkeletonRows() { return <div className="skeleton-list" data-testid="loading-data">{[0, 1, 2, 3].map((n) => <div className="skeleton-row" key={n}><i /><i /><i /><i /></div>)}</div>; }

function Metric({ label, value, note, icon: Icon, tint = '' }: { label: string; value: string; note: string; icon: LucideIcon; tint?: string }) {
  return <article className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tint}`}><Icon size={17} /></div></div><div className="metric-value mono">{value}</div><div className="metric-note">{note}</div></article>;
}
function Dashboard() {
  const role = useContext(RoleContext);
  const rooms = useTable('classrooms'), devices = useTable('devices'), alerts = useTable('alerts'), energy = useTable('energy_readings'), tickets = useTable('maintenance_tickets');
  const tables = [rooms, devices, alerts, energy, tickets];
  const errorTable = tables.find((state) => state.error);
  const anyLoading = tables.some((state) => state.loading);
  const refreshAll = () => tables.forEach((s) => s.refresh());
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationMessage, setAutomationMessage] = useState('');
  const [automationError, setAutomationError] = useState('');
  const runAutomation = async () => {
    if (!supabase) { setAutomationError('Supabase is not configured.'); return; }
    setAutomationBusy(true); setAutomationError(''); setAutomationMessage('');
    const { data, error } = await supabase.rpc('classiq_run_campus_automation');
    setAutomationBusy(false);
    if (error) setAutomationError(error.message);
    else { setAutomationMessage(`${Number(data ?? 0)} rooms checked against occupancy, sensor and timetable rules.`); refreshAll(); }
  };
  const openAlerts = alerts.data.filter((a) => !a.is_read);
  const onlineDevices = devices.data.filter((d) => ['online', 'on'].includes(String(d.status).toLowerCase()));
  const powerNow = devices.data.reduce((sum, d) => sum + Number(d.current_power || 0), 0);
  const todayEnergy = energy.data.reduce((sum, e) => sum + Number(e.energy_kwh || 0), 0);
  return <div className="dashboard-page">
    <PageHeading eyebrow={`${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()).toUpperCase()} · CAMPUS OPERATIONS`} title="Campus, at a glance." description="A clear read on what’s happening across your learning spaces." action={<div className="dashboard-heading-actions">{['ADMIN', 'FACULTY'].includes(role) && <button className="button button-quiet" onClick={runAutomation} disabled={automationBusy} data-testid="button-run-campus-automation"><Activity size={15} />{automationBusy ? 'Checking rooms…' : 'Run automation'}</button>}<Link href="/classrooms" className="button button-primary" data-testid="link-view-rooms"><DoorOpen size={16} /> View rooms</Link></div>} />
    {automationError && <div className="inline-error" data-testid="text-automation-error"><AlertTriangle size={15} />{automationError}</div>}
    {automationMessage && <div className="success-message" data-testid="text-automation-result"><Check size={15} />{automationMessage}</div>}
    {!supabase && <div className="setup-banner" data-testid="banner-supabase-setup"><div className="setup-mark"><Settings size={17} /></div><div><b>Connect your campus data</b><p>Live operations need a Supabase project. Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then apply the ClassIQ schema to unlock this view.</p></div><Link href="/settings" className="setup-link" data-testid="link-setup-settings">Setup guide <ArrowRight size={14} /></Link></div>}
    {errorTable && <ErrorState message={errorTable.error ?? 'Unable to load records.'} retry={refreshAll} />}
    <div className="metric-grid">
      {anyLoading ? [0, 1, 2, 3].map((n) => <div className="metric-card metric-skeleton" key={n} data-testid={`loading-metric-${n}`}><i /><i /><i /></div>) : <>
        <Metric label="Classrooms" value={String(rooms.data.length)} note={rooms.data.some((room) => room.is_simulated) ? 'Inventory includes simulated seed records' : 'Rooms in connected inventory'} icon={DoorOpen} tint="teal" />
        <Metric label="Devices online" value={`${onlineDevices.length} / ${devices.data.length}`} note="Reported current device state" icon={Cpu} tint="blue" />
        <Metric label="Open alerts" value={String(openAlerts.length)} note="Unread records in alerts" icon={Bell} tint="amber" />
        <Metric label="Energy recorded" value={`${todayEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`} note={energy.data.some((row) => row.is_simulated) ? 'Includes readings marked simulated' : powerNow ? `${powerNow.toLocaleString()} W current device draw` : 'Sum of returned meter readings'} icon={Zap} tint="gold" />
      </>}
    </div>
    <div className="dashboard-grid">
      <section className="panel room-panel"><div className="panel-heading"><div><div className="eyebrow">ROOM READINESS</div><h2>Classrooms</h2></div><Link href="/classrooms" className="text-link" data-testid="link-all-classrooms">All rooms <ArrowRight size={15} /></Link></div>
        {rooms.loading ? <SkeletonRows /> : rooms.error ? <ErrorState message={rooms.error} retry={rooms.refresh} /> : rooms.data.length ? <div className="room-list">{rooms.data.slice(0, 5).map((room) => <Link href={`/classrooms/${room.id}`} key={room.id} className="room-row" data-testid={`row-room-${room.id}`}><div className="room-icon"><DoorOpen size={17} /></div><div className="room-main"><b>{room.name || `Room ${room.room_number}`}</b><small>Room {pretty(room.room_number)} · Floor {pretty(room.floor)}</small></div><span className={`status-tag ${/active|scheduled|available/i.test(String(room.status)) ? 'tag-green' : 'tag-neutral'}`} data-testid={`status-room-${room.id}`}>{pretty(room.status)}</span><ArrowRight size={15} className="row-arrow" /></Link>)}</div> : <EmptyState table="classrooms" refresh={rooms.refresh} />}
      </section>
      <section className="panel pulse-panel"><div className="panel-heading"><div><div className="eyebrow">CAMPUS PULSE</div><h2>On the floor</h2></div><span className="live-indicator"><span /> UPDATED LIVE</span></div>
        <div className="pulse-hero"><div className="pulse-ring"><Activity size={24} /></div><div><b>{devices.loading ? '—' : `${devices.data.length} devices`}</b><span>in connected inventory</span></div></div>
        <div className="pulse-row"><span><span className="pulse-bullet green" />Reporting online</span><b className="mono">{devices.loading ? '—' : onlineDevices.length}</b></div>
        <div className="pulse-row"><span><span className="pulse-bullet amber" />Open maintenance</span><b className="mono">{tickets.loading ? '—' : tickets.data.filter((t) => !['resolved', 'closed'].includes(String(t.status).toLowerCase())).length}</b></div>
        <div className="pulse-row"><span><span className="pulse-bullet red" />Unread alerts</span><b className="mono">{alerts.loading ? '—' : openAlerts.length}</b></div>
        <Link href="/digital-twin" className="pulse-cta" data-testid="link-digital-twin">Open campus twin <ArrowRight size={15} /></Link>
      </section>
      <section className="panel alerts-panel"><div className="panel-heading"><div><div className="eyebrow">NEEDS ATTENTION</div><h2>Recent alerts</h2></div><Link href="/alerts" className="text-link" data-testid="link-all-alerts">View all <ArrowRight size={15} /></Link></div>
        {alerts.loading ? <SkeletonRows /> : alerts.error ? <ErrorState message={alerts.error} retry={alerts.refresh} /> : openAlerts.length ? <div className="alert-list">{openAlerts.slice(0, 4).map((alert) => <div className="alert-row" key={alert.id} data-testid={`alert-row-${alert.id}`}><div className={`alert-mark ${String(alert.severity).toLowerCase()}`}><AlertTriangle size={16} /></div><div className="alert-copy"><b>{pretty(alert.title)}</b><small>{pretty(alert.message)}</small></div><time className="mono">{alert.created_at ? new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</time></div>)}</div> : <div className="quiet-empty"><ShieldCheck size={19} /><span>No unread alerts in connected data.</span></div>}
      </section>
    </div>
     <div className="source-note" data-testid="text-data-source"><span className="source-mark"><Check size={12} /></span>Operational figures are derived from connected Supabase records. Seed and simulator rows are explicitly marked <span className="sim-badge">SIMULATED DATA</span><span className="source-spacer" /><button onClick={refreshAll} className="subtle-button" data-testid="button-refresh-dashboard">Refresh <Activity size={13} /></button></div>
  </div>;
}

function RecordsPage({ config }: { config: typeof pageConfig[string] }) {
  const role = useContext(RoleContext);
  const state = useTable(config.table);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState('{\n  \n}');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [location] = useLocation();
  const filtered = useMemo(() => state.data.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()))), [state.data, search]);
  const attendedCount = state.data.filter((row) => ['present', 'late'].includes(String(row.status ?? '').toLowerCase())).length;
  const attendanceRate = state.data.length ? (attendedCount / state.data.length) * 100 : 0;
  const columns = useMemo(() => {
    if (!state.data.length) return [];
     const prefer = ['name', 'room_number', 'device_type', 'status', 'severity', 'title', 'priority', 'is_simulated', 'building_id', 'floor', 'capacity', 'current_power', 'health_score', 'energy_kwh', 'estimated_cost', 'day_of_week', 'start_time', 'end_time', 'attendance_date', 'student_id', 'role', 'action', 'entity_type', 'created_at'];
    return [...prefer.filter((key) => key in state.data[0]), ...Object.keys(state.data[0]).filter((key) => !prefer.includes(key))].slice(0, 6);
  }, [state.data]);
  const addRecord = async (e: FormEvent) => {
    e.preventDefault(); setActionError('');
    if (!supabase) return setActionError('Supabase is not configured.');
    let payload: Row;
    try { payload = JSON.parse(draft); } catch { return setActionError('Enter a valid JSON object.'); }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') return setActionError('Record must be a JSON object.');
    setSaving(true);
    const { error } = await supabase.from(config.table).insert(payload);
    setSaving(false);
    if (error) setActionError(error.message);
    else { setModal(false); setDraft('{\n  \n}'); state.refresh(); }
  };
  const updateRow = async (row: Row) => {
    if (!supabase) return;
    const key = row.id !== undefined ? 'id' : Object.keys(row)[0];
    const status = String(row.status ?? '').toUpperCase();
    const next = config.table === 'alerts'
      ? { is_read: !row.is_read }
      : config.table === 'maintenance_tickets'
        ? { status: status === 'OPEN' ? 'IN_PROGRESS' : status === 'IN_PROGRESS' ? 'RESOLVED' : 'OPEN' }
        : config.table === 'attendance'
          ? { status: status === 'ABSENT' ? 'PRESENT' : 'ABSENT', method: 'MANUAL', check_in_time: status === 'ABSENT' ? new Date().toISOString() : null }
          : null;
    if (!next) return;
    const { error } = await supabase.from(config.table).update(next).eq(key, row[key]);
    if (error) setActionError(error.message);
    else {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) void supabase.from('audit_logs').insert({ user_id: auth.user.id, action: `UPDATE_${config.table.toUpperCase()}`, entity_type: config.table, entity_id: row.id ?? null, metadata: next });
      state.refresh();
    }
  };
  const updateProfileRole = async (row: Row, nextRole: string) => {
    if (!supabase || role !== 'ADMIN') return;
    setActionError('');
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', row.id);
    if (error) { setActionError(error.message); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) void supabase.from('audit_logs').insert({ user_id: auth.user.id, action: 'UPDATE_PROFILE_ROLE', entity_type: 'profile', entity_id: row.id, metadata: { role: nextRole } });
    state.refresh();
  };
  const resolveHref = (row: Row) => location === '/classrooms' ? `/classrooms/${row.id}` : location === '/devices' ? `/devices/${row.id}` : null;
  const canAddRecord = role === 'ADMIN'
    || (role === 'FACULTY' && ['devices', 'timetable', 'attendance'].includes(config.table))
    || (role === 'MAINTENANCE' && ['devices', 'maintenance_tickets'].includes(config.table));
  return <div className="records-page">
    <PageHeading eyebrow={config.eyebrow} title={config.title} description={config.description} action={canAddRecord ? <button className="button button-primary" onClick={() => { setActionError(''); setModal(true); }} data-testid={`button-add-${config.table}`}><Plus size={16} /> Add record</button> : undefined} />
    {config.table === 'attendance' && <div className="attendance-summary"><Metric label="Recorded attendance rate" value={state.loading ? '—' : state.data.length ? `${attendanceRate.toFixed(1)}%` : '—'} note="Present or late / returned attendance rows" icon={GraduationCap} tint="teal" /><Metric label="Present or late" value={state.loading ? '—' : String(attendedCount)} note="Count of records with these statuses" icon={Check} tint="blue" /><Metric label="Attendance records" value={state.loading ? '—' : String(state.data.length)} note="Rows returned from the attendance table" icon={Users} tint="amber" /></div>}
    <div className="filterbar"><label className="searchbox"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} data-testid={`input-search-${config.table}`} /></label><span className="record-count mono" data-testid={`text-record-count-${config.table}`}>{state.loading ? '…' : `${filtered.length} RECORD${filtered.length === 1 ? '' : 'S'}`}</span><button className="icon-button refresh-button" onClick={state.refresh} title="Refresh records" data-testid={`button-refresh-${config.table}`}><Activity size={16} /></button></div>
    {actionError && <div className="inline-error" data-testid="text-action-error"><AlertTriangle size={15} />{actionError}</div>}
    <section className="panel table-panel">
      {state.loading ? <SkeletonRows /> : state.error ? <ErrorState message={state.error} retry={state.refresh} /> : !state.data.length ? <EmptyState table={config.table} refresh={state.refresh} /> : !filtered.length ? <div className="state-box compact-state" data-testid="empty-search-results"><Search size={18} /><h3>No matching records</h3><p>Try a different search term.</p></div> :
         <div className="table-scroll"><table data-testid={`table-${config.table}`}><thead><tr>{columns.map((column) => <th key={column}>{titleCase(column)}</th>)}<th className="actions-head">Manage</th></tr></thead><tbody>{filtered.map((row, index) => {
           const href = resolveHref(row);
           return <tr key={row.id ?? index} data-testid={`row-${config.table}-${row.id ?? index}`}>{columns.map((column) => <td key={column} data-testid={`cell-${config.table}-${column}-${row.id ?? index}`}>{column === 'is_simulated' ? row[column] ? <span className="sim-badge">SIMULATED DATA</span> : <span>Live</span> : column === 'status' || column === 'severity' || column === 'priority' ? <span className={`status-tag ${/active|online|available|resolved|present|low|on/i.test(String(row[column])) ? 'tag-green' : /high|critical|offline|absent|open|fault/i.test(String(row[column])) ? 'tag-amber' : 'tag-neutral'}`}>{pretty(row[column])}</span> : column === 'created_at' || column === 'recorded_at' || column === 'attendance_date' ? <span className="mono">{row[column] ? new Date(row[column]).toLocaleString([], { dateStyle: 'medium', timeStyle: column === 'attendance_date' ? undefined : 'short' }) : '—'}</span> : <span className={typeof row[column] === 'number' ? 'mono' : ''}>{pretty(row[column])}</span>}</td>)}
             <td className="row-manage">{href && <Link href={href} className="table-action" data-testid={`link-record-${row.id}`} aria-label={`Open ${config.title} record`}>Open <ArrowRight size={14} /></Link>}{config.table === 'alerts' && <button className="table-action" onClick={() => updateRow(row)} data-testid={`button-toggle-alert-${row.id}`}>{row.is_read ? 'Mark unread' : 'Mark read'} <Check size={14} /></button>}{config.table === 'maintenance_tickets' && ['ADMIN', 'MAINTENANCE'].includes(role) && <button className="table-action" onClick={() => updateRow(row)} data-testid={`button-advance-ticket-${row.id}`}>Advance status <ArrowRight size={14} /></button>}{config.table === 'attendance' && ['ADMIN', 'FACULTY'].includes(role) && <button className="table-action" onClick={() => updateRow(row)} data-testid={`button-toggle-attendance-${row.id}`}>{String(row.status).toUpperCase() === 'ABSENT' ? 'Mark present' : 'Mark absent'} <Check size={14} /></button>}{config.table === 'profiles' && role === 'ADMIN' && <select className="role-select" value={String(row.role ?? 'STUDENT')} aria-label={`Change role for ${row.email ?? row.id}`} onChange={(event) => void updateProfileRole(row, event.target.value)} data-testid={`select-profile-role-${row.id}`}><option value="STUDENT">STUDENT</option><option value="FACULTY">FACULTY</option><option value="MAINTENANCE">MAINTENANCE</option><option value="ADMIN">ADMIN</option></select>}</td>
          </tr>;
        })}</tbody></table></div>}
    </section>
    {modal && <div className="modal-backdrop" role="presentation"><form className="modal-card" onSubmit={addRecord} data-testid={`form-create-${config.table}`}><div className="modal-head"><div><div className="eyebrow">SUPABASE RECORD</div><h2>Add to {config.title.toLowerCase()}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setModal(false)} data-testid="button-close-create"><X size={17} /></button></div><p>Enter the fields required by the connected <span className="mono">{config.table}</span> schema. The record will be written to Supabase.</p><textarea className="json-editor mono" value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} spellCheck={false} aria-label="Record fields in JSON" data-testid={`input-record-json-${config.table}`} />{actionError && <div className="inline-error">{actionError}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setModal(false)} data-testid="button-cancel-create">Cancel</button><button className="button button-primary" disabled={saving} data-testid={`button-submit-create-${config.table}`}>{saving ? 'Saving…' : 'Save record'} <ArrowRight size={15} /></button></div></form></div>}
  </div>;
}

function DetailPage({ kind }: { kind: 'classroom' | 'device' }) {
  const role = useContext(RoleContext);
  const id = decodeURIComponent(window.location.pathname.split('/').pop() ?? '');
  const table = kind === 'classroom' ? 'classrooms' : 'devices';
  const state = useTable(table), children = useTable(kind === 'classroom' ? 'devices' : 'device_readings');
  const sensors = useTable(kind === 'classroom' ? 'sensors' : 'maintenance_tickets');
  const [setting, setSetting] = useState(false);
  const [simulatorAction, setSimulatorAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const item = state.data.find((row) => String(row.id) === String(id));
  const related = children.data.filter((row) => String(row[kind === 'classroom' ? 'classroom_id' : 'device_id']) === String(id));
  const sensorRows = sensors.data.filter((row) => String(row[kind === 'classroom' ? 'classroom_id' : 'device_id']) === String(id));
  const control = async (device: Row, command: 'ON' | 'OFF' | 'AUTO') => {
    setActionError(''); setActionSuccess('');
    if (!supabase) return setActionError('Supabase is not configured.');
    setSetting(true);
    const { error } = await supabase.rpc('classiq_set_device_command', { target_device: device.id, command_name: command });
    setSetting(false);
    if (error) setActionError(error.message);
    else { setActionSuccess(`Device command ${command} was saved to Supabase.`); state.refresh(); children.refresh(); }
  };
  const simulate = async (action: string) => {
    setActionError(''); setActionSuccess('');
    if (!supabase) return setActionError('Supabase is not configured.');
    setSimulatorAction(action);
    const { error } = await supabase.rpc('classiq_simulate_room_action', { target_room: id, action_name: action });
    setSimulatorAction('');
    if (error) setActionError(error.message);
    else {
      setActionSuccess('Simulator action saved. New readings and related records are marked SIMULATED DATA.');
      state.refresh(); children.refresh(); sensors.refresh();
    }
  };
  const label = kind === 'classroom' ? item?.name || `Room ${item?.room_number ?? id}` : item?.name ?? 'Device';
  const commonError = state.error || children.error || sensors.error;
  const canControl = ['ADMIN', 'FACULTY', 'MAINTENANCE'].includes(role);
  const canSimulate = ['ADMIN', 'FACULTY'].includes(role);
  const hasSimulatedData = Boolean(item?.is_simulated || sensorRows.some((row) => row.is_simulated));
  return <div className="detail-page">
    <div className="backline"><Link href={kind === 'classroom' ? '/classrooms' : '/devices'} className="back-link" data-testid="link-back-list"><ChevronLeft size={15} /> All {kind === 'classroom' ? 'classrooms' : 'devices'}</Link><span className="detail-id mono">{table.slice(0, -1).toUpperCase()} / {id}</span></div>
    <PageHeading eyebrow={kind === 'classroom' ? 'CLASSROOM DETAIL' : 'DEVICE DETAIL'} title={label} description={kind === 'classroom' ? `Floor ${pretty(item?.floor)} · Capacity ${pretty(item?.capacity)} · ${pretty(item?.status)}` : `${pretty(item?.device_type)} · ${pretty(item?.control_mode)} control`} action={kind === 'device' && item && canControl ? <div className="control-actions"><button className="button button-quiet" onClick={() => control(item, 'ON')} disabled={setting} data-testid="button-device-on"><Zap size={14} /> On</button><button className="button button-quiet" onClick={() => control(item, 'OFF')} disabled={setting} data-testid="button-device-off">Off</button><button className="button button-quiet" onClick={() => control(item, 'AUTO')} disabled={setting} data-testid="button-device-auto">Auto</button></div> : undefined} />
    {actionError && <div className="inline-error" data-testid="text-detail-action-error"><AlertTriangle size={15} />{actionError}</div>}
    {actionSuccess && <div className="success-message" data-testid="text-detail-action-success"><Check size={15} />{actionSuccess}</div>}
    {(state.loading || children.loading || sensors.loading) && <SkeletonRows />}
    {commonError && <ErrorState message={commonError} retry={() => { state.refresh(); children.refresh(); sensors.refresh(); }} />}
    {!state.loading && !state.error && !item && <EmptyState table={table} refresh={state.refresh} />}
    {item && <>
      <div className="detail-metrics">{(kind === 'classroom' ? [['Capacity', pretty(item.capacity), Users], ['Floor', pretty(item.floor), Building2], ['Equipment', String(related.length), Cpu], ['Room state', pretty(item.status), Activity]] : [['Current power', item.current_power == null ? '—' : `${item.current_power} W`, Zap], ['Health score', item.health_score == null ? '—' : `${item.health_score}%`, Gauge], ['Operating hours', pretty(item.operating_hours), Clock3], ['Device state', pretty(item.status), Activity]]).map(([labelText, value, Icon]) => <Metric key={String(labelText)} label={String(labelText)} value={String(value)} note={kind === 'classroom' ? 'Reported room inventory' : 'Reported device telemetry'} icon={Icon as LucideIcon} />)}</div>
      {kind === 'classroom' && canSimulate && <section className="panel simulator-panel" data-testid="panel-room-simulator"><div className="panel-heading"><div><div className="eyebrow">CONTROLLED TEST SCENARIO</div><h2>IoT simulator</h2></div><span className="sim-badge" data-testid="badge-simulated-data">SIMULATED DATA</span></div><p>These controls write clearly flagged test sensor readings, device changes, alerts and maintenance records to Supabase. They do not control physical hardware.</p><div className="simulator-actions"><button className="button button-quiet" onClick={() => simulate('STUDENT_ENTRY')} disabled={!!simulatorAction} data-testid="button-sim-student-entry"><Plus size={14} /> Simulate entry</button><button className="button button-quiet" onClick={() => simulate('STUDENT_EXIT')} disabled={!!simulatorAction} data-testid="button-sim-student-exit"><DoorOpen size={14} /> Simulate exit</button><button className="button button-quiet" onClick={() => simulate('INCREASE_TEMPERATURE')} disabled={!!simulatorAction} data-testid="button-sim-temperature-up"><Activity size={14} /> Raise temperature</button><button className="button button-quiet" onClick={() => simulate('DECREASE_TEMPERATURE')} disabled={!!simulatorAction} data-testid="button-sim-temperature-down"><Activity size={14} /> Lower temperature</button><button className="button button-quiet" onClick={() => simulate('ENERGY_SPIKE')} disabled={!!simulatorAction} data-testid="button-sim-energy-spike"><Zap size={14} /> Energy spike</button><button className="button button-quiet" onClick={() => simulate('DEVICE_FAILURE')} disabled={!!simulatorAction} data-testid="button-sim-device-failure"><AlertTriangle size={14} /> Device failure</button><button className="button button-quiet" onClick={() => simulate('RECONNECT_DEVICE')} disabled={!!simulatorAction} data-testid="button-sim-reconnect"><Activity size={14} /> Reconnect device</button></div>{simulatorAction && <div className="simulator-progress" data-testid="text-simulator-progress">Applying {titleCase(simulatorAction)}…</div>}</section>}
      <div className="dashboard-grid detail-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">{kind === 'classroom' ? 'ROOM EQUIPMENT' : 'DEVICE TELEMETRY'}</div><h2>{kind === 'classroom' ? 'Connected devices' : 'Recent readings'}</h2></div></div>{children.loading ? <SkeletonRows /> : related.length ? <div className="room-list">{related.slice(0, 12).map((row) => <Link className="room-row" href={kind === 'classroom' ? `/devices/${row.id}` : `/classrooms/${row.classroom_id}`} key={row.id} data-testid={`row-related-${row.id}`}><div className="room-icon"><Cpu size={17} /></div><div className="room-main"><b>{pretty(row.name || row.device_type || row.recorded_at)}</b><small>{kind === 'classroom' ? `${pretty(row.device_type)} · ${pretty(row.status)}` : `Power ${pretty(row.power)} W · ${pretty(row.voltage)} V`}</small></div><ArrowRight size={15} className="row-arrow" /></Link>)}</div> : <EmptyState table={kind === 'classroom' ? 'devices' : 'device_readings'} refresh={children.refresh} />}</section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{kind === 'classroom' ? 'SENSOR CONDITIONS' : 'SERVICE HISTORY'}</div><h2>{kind === 'classroom' ? 'Room sensors' : 'Maintenance'}</h2></div>{kind === 'classroom' && hasSimulatedData && <span className="sim-badge">SIMULATED DATA</span>}</div>{sensors.loading ? <SkeletonRows /> : sensorRows.length ? <div className="sensor-list">{sensorRows.map((row) => <div className="sensor-row" key={row.id} data-testid={`row-sensor-${row.id}`}><div><b>{pretty(row.sensor_type || row.title)}</b><small>{pretty(row.status || row.description)} {row.is_simulated && <span className="sim-inline">SIMULATED</span>}</small></div><strong className="mono">{pretty(row.value)} {pretty(row.unit)}</strong></div>)}</div> : <EmptyState table={kind === 'classroom' ? 'sensors' : 'maintenance_tickets'} refresh={sensors.refresh} />}</section></div>
      <div className="source-note" data-testid="text-detail-data-source"><span className="source-mark"><Check size={12} /></span>{hasSimulatedData ? <><span className="sim-badge">SIMULATED DATA</span> Seed records and simulator readings are not physical sensor telemetry.</> : 'Measurements and status are reported by connected Supabase records.'}</div>
    </>}
  </div>;
}

function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [, navigate] = useLocation();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!supabase) return setError('Supabase is not configured. Add the project URL and publishable key first.');
    setBusy(true);
    const result = mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === 'signup' && !result.data.session) setSuccess('Check your email to confirm your account, then sign in.');
    else navigate('/dashboard');
  };
  return <div className="auth-page grain"><div className="auth-art"><Link href="/dashboard" className="brand auth-brand" data-testid="link-auth-brand"><span className="brand-mark"><span /></span><span>class<span className="brand-iq">IQ</span><small>CAMPUS OPERATIONS</small></span></Link><div className="auth-art-content"><div className="eyebrow">THE CAMPUS, IN FOCUS</div><h1 className="serif">Every room.<br />Ready for<br /><em>what’s next.</em></h1><p>A trustworthy live operations view for the people who keep learning moving.</p><div className="auth-art-foot"><span>ROOMS</span><i /><span>EQUIPMENT</span><i /><span>ENERGY</span></div></div><div className="auth-art-grid" /></div><div className="auth-form-side"><div className="auth-form-wrap"><div className="auth-kicker"><span className="status-dot dot-green" /> SECURE CAMPUS ACCESS</div><h2 className="serif">{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h2><p className="auth-copy">Sign in to access connected campus operations.</p><div className="auth-tabs"><button className={mode === 'signin' ? 'selected' : ''} onClick={() => { setMode('signin'); setError(''); }} data-testid="button-auth-signin">Sign in</button><button className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(''); }} data-testid="button-auth-signup">Create account</button></div><form className="auth-form" onSubmit={submit}>{mode === 'signup' && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Your name" data-testid="input-auth-name" /></label>}<label>Campus email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@college.edu" data-testid="input-auth-email" /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" data-testid="input-auth-password" /></label>{error && <div className="inline-error" data-testid="text-auth-error"><AlertTriangle size={15} />{error}</div>}{success && <div className="success-message" data-testid="text-auth-success"><Check size={15} />{success}</div>}<button className="button button-primary auth-submit" disabled={busy} data-testid="button-auth-submit">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in to ClassIQ' : 'Create account'} <ArrowRight size={16} /></button></form><p className="auth-footnote"><ShieldCheck size={14} /> Access is protected by your Supabase project’s authentication and policies.</p><Link href="/dashboard" className="auth-back" data-testid="link-auth-return"><ChevronLeft size={14} /> Return to operations view</Link></div></div></div>;
}

function AssistantPage() {
  const ask = useAskClassroomAssistant();
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<{ question: string; answer: string; sources: string[] }[]>([]);
  const send = async (e: FormEvent) => { e.preventDefault(); if (!question.trim() || ask.isPending) return; const prompt = question.trim(); setQuestion(''); try { const result = await ask.mutateAsync({ data: { question: prompt } }); setAnswers((old) => [...old, { question: prompt, answer: result.answer, sources: result.sources }]); } catch { setAnswers((old) => [...old, { question: prompt, answer: 'The data-grounded assistant is currently unavailable. No answer was generated. Check that the assistant endpoint is online and that you are signed in.', sources: [] }]); } };
  return <div className="assistant-page"><PageHeading eyebrow="DATA-GROUNDED SUPPORT" title="Ask ClassIQ" description="Ask about connected classrooms, equipment and current campus operations." /><div className="assistant-shell panel"><div className="assistant-intro"><div className="assistant-mark"><CircleHelp size={22} /></div><div><b>Answers from connected records</b><p>Responses come from the available authenticated Supabase data. ClassIQ won’t guess when records aren’t available.</p></div></div><div className="assistant-history" data-testid="assistant-conversation">{answers.length === 0 && <div className="assistant-empty"><div className="assistant-orbit"><Activity size={22} /></div><h3>What would you like to know?</h3><p>Try asking a specific question about the current campus data.</p><div className="suggested-questions">{['Which classrooms are currently listed?', 'What needs maintenance attention?', 'What energy readings are available?'].map((prompt, i) => <button key={prompt} onClick={() => setQuestion(prompt)} data-testid={`button-suggested-question-${i}`}>{prompt}<ArrowRight size={14} /></button>)}</div></div>}{answers.map((entry, i) => <div className="conversation-pair" key={`${entry.question}-${i}`}><div className="question-bubble" data-testid={`text-question-${i}`}>{entry.question}</div><div className="answer-block" data-testid={`text-answer-${i}`}><div className="answer-brand">IQ</div><div><p>{entry.answer}</p>{entry.sources.length > 0 && <div className="source-list"><b>Sources</b>{entry.sources.map((source) => <span className="source-chip mono" key={source}>{source}</span>)}</div>}</div></div></div>)}{ask.isPending && <div className="answer-block" data-testid="assistant-loading"><div className="answer-brand">IQ</div><div className="answer-loading"><i /><i /><i /></div></div>}</div><form className="assistant-composer" onSubmit={send}><textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your connected campus data…" rows={2} maxLength={500} data-testid="input-assistant-question" /><div className="composer-bottom"><span>Grounded responses · {question.length}/500</span><button className="button button-primary" disabled={!question.trim() || ask.isPending} data-testid="button-send-assistant">{ask.isPending ? 'Checking…' : 'Ask'} <Send size={15} /></button></div></form></div><div className="assistant-disclaimer"><ShieldCheck size={15} /> Each answer is tied to current available data and includes its sources when returned.</div></div>;
}

function EnergyPage() {
  const energy = useTable('energy_readings');
  const records = useMemo(() => [...energy.data].filter((row) => Number.isFinite(Number(row.energy_kwh)) && row.recorded_at).sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).slice(-14), [energy.data]);
  const totalKwh = energy.data.reduce((sum, row) => sum + Number(row.energy_kwh || 0), 0);
  const totalCost = energy.data.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
  const newest = [...energy.data].filter((row) => row.recorded_at).sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0];
  const currentPower = newest ? Number(newest.power || 0) : null;
  const points = records.map((row, index) => {
    const values = records.map((record) => Number(record.energy_kwh));
    const low = Math.min(...values), high = Math.max(...values);
    return { x: records.length === 1 ? 50 : 8 + index * 84 / (records.length - 1), y: high === low ? 50 : 88 - ((Number(row.energy_kwh) - low) / (high - low)) * 74, row };
  });
  return <div><PageHeading eyebrow="RESOURCE MONITORING" title="Energy" description="Metered energy use and cost from recorded classroom readings." action={<button className="button button-quiet" onClick={energy.refresh} data-testid="button-refresh-energy"><Activity size={15} /> Refresh readings</button>} />
    {energy.error ? <ErrorState message={energy.error} retry={energy.refresh} /> : energy.loading ? <div className="metric-grid">{[0, 1, 2, 3].map((n) => <div className="metric-card metric-skeleton" key={n}><i /><i /><i /></div>)}</div> : !energy.data.length ? <EmptyState table="energy_readings" refresh={energy.refresh} /> : <>
      {energy.data.some((row) => row.is_simulated) && <div className="simulation-notice" data-testid="notice-simulated-energy"><span className="sim-badge">SIMULATED DATA</span><span>Some displayed meter readings are seeded or written by the IoT simulator, not physical meters.</span></div>}
      <div className="metric-grid"><Metric label="Recorded energy" value={`${totalKwh.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh`} note="Sum of returned meter records" icon={Zap} tint="gold" /><Metric label="Estimated cost" value={totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} note="Sum of estimated_cost as stored" icon={Activity} tint="amber" /><Metric label="Latest power reading" value={currentPower === null ? '—' : `${currentPower.toLocaleString()} W`} note="Most recent timestamped meter row" icon={Gauge} tint="blue" /><Metric label="Meter readings" value={String(energy.data.length)} note="Rows in connected energy_readings" icon={Clock3} tint="teal" /></div>
      <section className="panel energy-chart-panel"><div className="panel-heading"><div><div className="eyebrow">RECORDED METER HISTORY</div><h2>Energy readings over time</h2></div><span className="chart-legend"><i /> kWh recorded</span></div>{records.length < 2 ? <div className="chart-empty" data-testid="empty-energy-chart">At least two dated readings are needed to draw a trend. Only actual recorded values are shown.</div> : <div className="chart-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Chart of recorded energy readings" data-testid="chart-energy-trend"><line x1="8" x2="92" y1="88" y2="88" className="chart-axis" /><line x1="8" x2="92" y1="51" y2="51" className="chart-gridline" /><line x1="8" x2="92" y1="14" y2="14" className="chart-gridline" /><polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="chart-line" />{points.map((point, index) => <circle key={point.row.id ?? index} cx={point.x} cy={point.y} r="1.5" className="chart-point"><title>{new Date(point.row.recorded_at).toLocaleString()}: {point.row.energy_kwh} kWh</title></circle>)}</svg><div className="chart-labels"><span>{new Date(records[0].recorded_at).toLocaleDateString()}</span><span>{new Date(records[records.length - 1].recorded_at).toLocaleDateString()}</span></div></div>}</section>
      <div className="source-note" data-testid="text-energy-source"><span className="source-mark"><Check size={12} /></span>Chart and totals use returned <span className="mono">energy_readings</span> only; no modeled usage is mixed in.</div>
    </>}
  </div>;
}

function AnalyticsPage() {
  const buildings = useTable('buildings'), rooms = useTable('classrooms'), devices = useTable('devices'), insights = useTable('ai_insights');
  const states = [buildings, rooms, devices, insights];
  const error = states.find((state) => state.error);
  const refresh = () => states.forEach((state) => state.refresh());
  const byBuilding = useMemo(() => {
    const grouping = new Map<string, { title: string; rooms: number; capacity: number; devices: number }>();
    for (const room of rooms.data) {
      const key = String(room.building_id ?? 'unassigned');
      const building = buildings.data.find((entry) => String(entry.id) === key);
      const record = grouping.get(key) ?? { title: building?.name ?? (key === 'unassigned' ? 'Building not assigned' : `Building ${key}`), rooms: 0, capacity: 0, devices: 0 };
      record.rooms += 1; record.capacity += Number(room.capacity || 0);
      record.devices += devices.data.filter((device) => String(device.classroom_id) === String(room.id)).length;
      grouping.set(key, record);
    }
    return [...grouping.values()];
  }, [buildings.data, rooms.data, devices.data]);
  const classroomComparisons = useMemo(() => rooms.data.map((room) => {
    const roomDevices = devices.data.filter((device) => String(device.classroom_id) === String(room.id));
    const scores = roomDevices.filter((device) => device.health_score !== null && device.health_score !== undefined).map((device) => Number(device.health_score));
    return { id: room.id, name: room.name || `Room ${room.room_number}`, status: room.status, devices: roomDevices.length, averageHealth: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
  }), [rooms.data, devices.data]);
  const deviceComparisons = useMemo(() => {
    const groups = new Map<string, { type: string; total: number; online: number; health: number[] }>();
    devices.data.forEach((device) => {
      const type = String(device.device_type ?? 'Unspecified');
      const group = groups.get(type) ?? { type, total: 0, online: 0, health: [] };
      group.total += 1;
      if (String(device.status).toLowerCase() === 'online') group.online += 1;
      if (device.health_score !== null && device.health_score !== undefined) group.health.push(Number(device.health_score));
      groups.set(type, group);
    });
    return [...groups.values()];
  }, [devices.data]);
  const forecasts = insights.data.filter((row) => String(row.insight_type).toLowerCase().includes('forecast'));
  const anyLoading = states.some((state) => state.loading);
  return <div><PageHeading eyebrow="CAMPUS INTELLIGENCE" title="Analytics" description="Comparisons are calculated from connected records; forecasts are displayed only when explicitly stored as forecasts." action={<button className="button button-quiet" onClick={refresh} data-testid="button-refresh-analytics"><Activity size={15} /> Refresh</button>} />
    {error && <ErrorState message={error.error ?? 'Unable to load records.'} retry={refresh} />}
    {anyLoading && <div className="metric-grid">{[0, 1, 2, 3].map((n) => <div className="metric-card metric-skeleton" key={n}><i /><i /><i /></div>)}</div>}
    {!anyLoading && !error && <><div className="metric-grid"><Metric label="Buildings" value={String(buildings.data.length)} note="Connected building records" icon={Building2} tint="teal" /><Metric label="Classrooms" value={String(rooms.data.length)} note="Connected classroom records" icon={DoorOpen} tint="blue" /><Metric label="Devices" value={String(devices.data.length)} note="Connected equipment records" icon={Cpu} tint="amber" /><Metric label="Stored insights" value={String(insights.data.length)} note="Insights returned from Supabase" icon={Activity} tint="gold" /></div>
      <div className="analytics-grid">
        <section className="panel compare-panel">
          <div className="panel-heading"><div><div className="eyebrow">BUILDING COMPARISON</div><h2>Room footprint</h2></div><span className="mono comparison-unit">ROOMS · CAPACITY · DEVICES</span></div>
          {byBuilding.length ? <div className="comparison-list">{byBuilding.map((building, index) => <div className="comparison-row" key={`${building.title}-${index}`} data-testid={`comparison-building-${index}`}><b>{building.title}</b><span><strong className="mono">{building.rooms}</strong><small>rooms</small></span><span><strong className="mono">{building.capacity}</strong><small>capacity</small></span><span><strong className="mono">{building.devices}</strong><small>devices</small></span></div>)}</div> : <EmptyState table="classrooms" refresh={rooms.refresh} />}
        </section>
        <section className="panel compare-panel">
          <div className="panel-heading"><div><div className="eyebrow">STORED FORECASTS</div><h2>Forecast records</h2></div></div>
          {forecasts.length ? forecasts.map((forecast) => <article className="forecast-card" key={forecast.id} data-testid={`forecast-${forecast.id}`}><div className="forecast-label">FORECAST · STORED INSIGHT</div><h3>{pretty(forecast.title)}</h3><p>{pretty(forecast.description)}</p><div className="forecast-meta"><span>Confidence <b className="mono">{forecast.confidence == null ? '—' : `${forecast.confidence}%`}</b></span><span>Potential saving <b className="mono">{forecast.potential_saving_kwh == null ? '—' : `${forecast.potential_saving_kwh} kWh`}</b></span></div></article>) : <div className="chart-empty" data-testid="empty-forecasts">No records tagged as forecasts were returned. ClassIQ does not extrapolate missing data.</div>}
        </section>
        <section className="panel compare-panel">
          <div className="panel-heading"><div><div className="eyebrow">CLASSROOM COMPARISON</div><h2>Equipment &amp; health by room</h2></div></div>
          {classroomComparisons.length ? classroomComparisons.map((room, index) => <div className="comparison-row room-comparison-row" key={room.id ?? index} data-testid={`comparison-classroom-${room.id ?? index}`}><b>{pretty(room.name)}</b><span><strong className="mono">{room.devices}</strong><small>devices</small></span><span><strong className="mono">{room.averageHealth === null ? '—' : `${room.averageHealth.toFixed(1)}%`}</strong><small>avg. health</small></span><span><strong className="compare-status">{pretty(room.status)}</strong><small>reported state</small></span></div>) : <div className="chart-empty">No classroom comparison can be derived without classroom records.</div>}
        </section>
        <section className="panel compare-panel">
          <div className="panel-heading"><div><div className="eyebrow">DEVICE COMPARISON</div><h2>Health by equipment type</h2></div></div>
          {deviceComparisons.length ? deviceComparisons.map((group, index) => <div className="comparison-row device-comparison-row" key={`${group.type}-${index}`} data-testid={`comparison-device-type-${index}`}><b>{pretty(group.type)}</b><span><strong className="mono">{group.online} / {group.total}</strong><small>online / total</small></span><span><strong className="mono">{group.health.length ? `${(group.health.reduce((sum, score) => sum + score, 0) / group.health.length).toFixed(1)}%` : '—'}</strong><small>avg. health</small></span></div>) : <div className="chart-empty">No device comparison can be derived without device records.</div>}
        </section>
      </div>
      <div className="source-note" data-testid="text-analytics-source"><span className="source-mark"><Check size={12} /></span>Building comparisons are calculated from current room and device records. Forecasts are shown only from explicitly tagged stored insights.</div></>}
  </div>;
}

function TwinPage() {
  const buildings = useTable('buildings'), rooms = useTable('classrooms'), devices = useTable('devices');
  const state = [buildings, rooms, devices].find((entry) => entry.error);
  const refresh = () => { buildings.refresh(); rooms.refresh(); devices.refresh(); };
  return <div><PageHeading eyebrow="LIVE BUILDING INVENTORY" title="Digital twin" description="A room-by-room operational index assembled from current building, classroom and device records." action={<button className="button button-quiet" onClick={refresh} data-testid="button-refresh-twin"><Activity size={15} /> Refresh map</button>} />
    {state && <ErrorState message={state.error ?? 'Unable to load building records.'} retry={refresh} />}
    {(buildings.loading || rooms.loading || devices.loading) && <SkeletonRows />}
    {!state && !buildings.loading && !rooms.loading && !devices.loading && !buildings.data.length && !rooms.data.length && <EmptyState table="buildings and classrooms" refresh={refresh} />}
    {!state && !buildings.loading && !rooms.loading && !devices.loading && (buildings.data.length > 0 || rooms.data.length > 0) && <div className="twin-buildings">{buildings.data.map((building, index) => {
      const buildingRooms = rooms.data.filter((room) => String(room.building_id) === String(building.id));
      return <section className="panel twin-building" key={building.id ?? index} data-testid={`building-card-${building.id ?? index}`}><div className="twin-building-head"><div className="building-symbol"><Building2 size={18} /></div><div><span className="eyebrow">BUILDING {String(index + 1).padStart(2, '0')}</span><h2>{pretty(building.name)}</h2><small>{pretty(building.location)} · {pretty(building.total_floors)} floors</small></div><span className="mono twin-count">{buildingRooms.length} ROOMS</span></div><div className="twin-rooms">{buildingRooms.map((room, roomIndex) => {
        const roomDevices = devices.data.filter((device) => String(device.classroom_id) === String(room.id));
        const roomStatus = String(room.status ?? '').toLowerCase();
        const available = ['available', 'empty'].includes(roomStatus);
        const occupied = ['active', 'occupied', 'in_use', 'in use', 'booked'].includes(roomStatus);
        return <Link href={`/classrooms/${room.id}`} className="twin-room" key={room.id ?? roomIndex} data-testid={`twin-room-${room.id ?? roomIndex}`}><div className={`twin-room-mark ${available ? 'twin-available' : occupied ? 'twin-occupied' : ''}`}><DoorOpen size={16} /></div><b>{pretty(room.name || `Room ${room.room_number}`)}</b><small>Floor {pretty(room.floor)} · {pretty(room.status)}</small><div className="twin-room-foot"><span>{roomDevices.length} devices</span><span className={`tiny-state ${available ? 'available' : ''}`} /></div></Link>;
      })}{buildingRooms.length === 0 && <div className="chart-empty">No classrooms are currently linked to this building.</div>}</div></section>;
    })}{rooms.data.some((room) => !buildings.data.some((building) => String(building.id) === String(room.building_id))) && <section className="panel twin-building"><div className="twin-building-head"><div className="building-symbol"><DoorOpen size={18} /></div><div><span className="eyebrow">UNASSIGNED BUILDING</span><h2>Rooms without a building link</h2><small>Shown separately; no building relationship was returned.</small></div></div><div className="twin-rooms">{rooms.data.filter((room) => !buildings.data.some((building) => String(building.id) === String(room.building_id))).map((room, index) => <Link href={`/classrooms/${room.id}`} className="twin-room" key={room.id ?? index} data-testid={`twin-unassigned-room-${room.id ?? index}`}><div className="twin-room-mark"><DoorOpen size={16} /></div><b>{pretty(room.name || `Room ${room.room_number}`)}</b><small>{pretty(room.status)}</small><div className="twin-room-foot"><span>{devices.data.filter((device) => String(device.classroom_id) === String(room.id)).length} devices</span><span className="tiny-state" /></div></Link>)}</div></section>}</div>}
  </div>;
}

function SettingsPage() {
  const [email, setEmail] = useState(''), [name, setName] = useState('');
  const [password, setPassword] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { if (!supabase) return; supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? ''); setName(data.user?.user_metadata?.full_name ?? ''); }); }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setNotice('');
    if (!supabase) return setNotice('Supabase is not configured. Preferences cannot be saved.');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setNotice('Sign in before updating your account profile.');
    const { error } = await supabase.auth.updateUser({ email: email || undefined, password: password || undefined, data: { full_name: name } });
    if (error) { setNotice(error.message); return; }
    const { error: profileError } = await supabase.from('profiles').update({ full_name: name, email }).eq('id', auth.user.id);
    setNotice(profileError ? `Authentication profile saved, but the campus profile row could not be updated: ${profileError.message}` : 'Profile changes saved to Supabase. Check your email if you changed the address.');
    setPassword('');
  };
  return <div><PageHeading eyebrow="PERSONAL PREFERENCES" title="Settings" description="Manage your profile and appearance preferences for ClassIQ." /><div className="settings-grid"><section className="panel settings-panel"><div className="eyebrow">ACCOUNT PROFILE</div><h2>Your details</h2><p>Account changes are saved to Supabase Auth.</p><form className="settings-form" onSubmit={save}><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-testid="input-settings-name" /></label><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" data-testid="input-settings-email" /></label><label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current password" minLength={6} data-testid="input-settings-password" /></label>{notice && <div className={notice.includes('saved') ? 'success-message' : 'inline-error'} data-testid="text-settings-notice">{notice}</div>}<button className="button button-primary" data-testid="button-save-settings">Save profile <ArrowRight size={15} /></button></form></section><section className="panel settings-panel"><div className="eyebrow">APPEARANCE</div><h2>Display mode</h2><p>Choose a comfortable environment for long shifts at the operations desk.</p><div className="preference-row"><div className="preference-icon"><Moon size={18} /></div><div><b>Light / dark theme</b><small>Saved on this device only</small></div><ThemeToggle /></div></section><section className="panel settings-panel connection-panel"><div className="eyebrow">DATA CONNECTION</div><h2>Supabase project</h2><div className="connection-row"><span className={`status-dot ${supabase ? 'dot-green' : 'dot-amber'}`} /><b>{supabase ? 'Project credentials detected' : 'Setup required'}</b></div><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in the app environment, then apply your database schema and seed records.</p><div className="setup-list"><span><Check size={14} /> Authentication uses Supabase Auth</span><span><Check size={14} /> Table reads subscribe to realtime changes</span><span><Check size={14} /> Writes persist to connected tables</span></div></section></div></div>;
}

function LoginRoute() { return <AuthPage />; }
function StandardRoute({ path }: { path: string }) { return <Shell><RecordsPage config={pageConfig[path]} /></Shell>; }
function DashboardRoute() { return <Shell><Dashboard /></Shell>; }
function AssistantRoute() { return <Shell><AssistantPage /></Shell>; }
function SettingsRoute() { return <Shell><SettingsPage /></Shell>; }
function EnergyRoute() { return <Shell><EnergyPage /></Shell>; }
function AnalyticsRoute() { return <Shell><AnalyticsPage /></Shell>; }
function TwinRoute() { return <Shell><TwinPage /></Shell>; }
function ClassroomDetailRoute() { return <Shell><DetailPage kind="classroom" /></Shell>; }
function DeviceDetailRoute() { return <Shell><DetailPage kind="device" /></Shell>; }
function DefaultRoute() { return <Shell><Dashboard /></Shell>; }

function Router() {
  return <Switch>
    <Route path="/" component={DefaultRoute} />
    <Route path="/login" component={LoginRoute} />
    <Route path="/dashboard" component={DashboardRoute} />
    <Route path="/classrooms" component={() => <StandardRoute path="/classrooms" />} />
    <Route path="/classrooms/:id" component={ClassroomDetailRoute} />
    <Route path="/devices" component={() => <StandardRoute path="/devices" />} />
    <Route path="/devices/:id" component={DeviceDetailRoute} />
    <Route path="/timetable" component={() => <StandardRoute path="/timetable" />} />
    <Route path="/attendance" component={() => <StandardRoute path="/attendance" />} />
    <Route path="/energy" component={EnergyRoute} />
    <Route path="/analytics" component={AnalyticsRoute} />
    <Route path="/maintenance" component={() => <StandardRoute path="/maintenance" />} />
    <Route path="/alerts" component={() => <StandardRoute path="/alerts" />} />
    <Route path="/digital-twin" component={TwinRoute} />
    <Route path="/users" component={() => <StandardRoute path="/users" />} />
    <Route path="/audit-logs" component={() => <StandardRoute path="/audit-logs" />} />
    <Route path="/settings" component={SettingsRoute} />
    <Route path="/ai-assistant" component={AssistantRoute} />
    <Route component={NotFound} />
  </Switch>;
}
function App() { return <QueryClientProvider client={queryClient}><Router /></QueryClientProvider>; }
export default App;
