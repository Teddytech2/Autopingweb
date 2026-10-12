import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowUpRight, CheckCircle2, Clock3, ExternalLink, Eye, Globe2,
  LoaderCircle, Plus, RefreshCw, ShieldCheck, Signal, XCircle, Zap
} from 'lucide-react';
import './style.css';

const demoSites = [
  { id: 'demo-1', name: 'TEDDY-XMD Pairing', url: 'https://teddyxmdultraminifinal-14c420cbedd9.herokuapp.com/', status: 'unknown', latencyMs: null, lastCheck: null },
  { id: 'demo-2', name: 'GitHub', url: 'https://github.com/Teddyxmd/TEDDY-XMD', status: 'unknown', latencyMs: null, lastCheck: null }
];

function App() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [adUrl, setAdUrl] = useState('');
  const [showAd, setShowAd] = useState(false);
  const [adError, setAdError] = useState('');
  const [showAddSite, setShowAddSite] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [savingSite, setSavingSite] = useState(false);
  const [siteMessage, setSiteMessage] = useState('');

  async function loadSites() {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/sites');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not load sites');
      setSites(data.sites || []);
    } catch (e) {
      setSites([]);
      setError(e.message || 'API unavailable. Run the project on Vercel with storage configured.');
    } finally { setLoading(false); setLastRefresh(new Date()); }
  }
  async function addSite(e) {
    e.preventDefault(); setSavingSite(true); setSiteMessage(''); setError('');
    try {
      const r = await fetch('/api/admin/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: siteName, url: siteUrl, password: adminPassword }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not add website');
      setSiteMessage('Website added successfully.'); setSiteName(''); setSiteUrl(''); setAdminPassword(''); setShowAddSite(false);
      await loadSites();
    } catch (e) { setSiteMessage(e.message || 'Could not add website.'); }
    finally { setSavingSite(false); }
  }

  async function runCheck() {
    setChecking(true); setError('');
    try {
      const r = await fetch('/api/cron', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Manual check failed');
      await loadSites();
    } catch (e) {
      setError('Checks run through the secured scheduled endpoint. Configure CRON_SECRET and your external cron service to execute checks.');
    } finally { setChecking(false); }
  }
  useEffect(() => { loadSites(); const t = setInterval(loadSites, 60000); return () => clearInterval(t); }, []);

  const up = sites.filter(s => s.status === 'up').length;
  const down = sites.filter(s => s.status === 'down').length;
  const unknown = sites.length - up - down;
  const avg = useMemo(() => {
    const nums = sites.filter(s => s.status === 'up' && Number.isFinite(s.latencyMs)).map(s => s.latencyMs);
    return nums.length ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : null;
  }, [sites]);

  function previewAd(e) {
    e.preventDefault(); setAdError(''); setShowAd(false);
    try {
      const u = new URL(adUrl);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      // This is only a standard iframe preview. Many ad providers prohibit embedding.
      setShowAd(true);
    } catch { setAdError('Enter a valid http:// or https:// URL.'); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={21}/></div><div><b>TEDDY-XMD</b><span>AutoPing</span></div></div>
      <div className="side-label">MONITORING</div>
      <div className="nav active"><Activity size={17}/> Overview</div>
      <div className="nav"><Globe2 size={17}/> Websites <span className="nav-count">{sites.length}</span></div>
      <div className="nav"><Eye size={17}/> Ad preview</div>
      <div className="sidebar-bottom"><div className="secure-icon"><ShieldCheck size={18}/></div><b>Monitoring status</b><p>Public, read-only dashboard</p><span className="live-dot"/> API status updates every minute</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="mobile-brand">TEDDY-XMD <span>AutoPing</span></div><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><span className="live-pill"><i/> SYSTEM MONITOR</span><button className="icon-btn" title="Refresh dashboard" onClick={loadSites}><RefreshCw size={17}/></button></div></header>
      <section className="welcome"><div><div className="eyebrow"><span className="eyebrow-line"/> WEBSITE INTELLIGENCE</div><h1>Know when your sites<br/><em>go dark.</em></h1><p>Real-time visibility into your websites, response times, and uptime.</p></div><div className="welcome-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core"><Signal size={34}/></div><div className="art-tag"><span className="live-dot"/> Monitoring ready</div></div></section>
      {error && <div className="notice"><XCircle size={17}/><span>{error}</span><button onClick={() => setError('')}><XCircle size={15}/></button></div>}
      <div className="section-head"><div><h2>Overview</h2><p>Your infrastructure at a glance</p></div><div className="head-actions"><span className="updated">{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Loading status…'}</span><button className="primary-btn" onClick={runCheck} disabled={checking}><RefreshCw size={15} className={checking ? 'spin' : ''}/>{checking ? 'Checking…' : 'Run checks'}</button></div></div>
      <div className="stats-grid">
        <Stat icon={<Globe2/>} label="MONITORED SITES" value={sites.length} detail="Registered URLs" tone="purple"/>
        <Stat icon={<CheckCircle2/>} label="ONLINE" value={up} detail={sites.length ? `${Math.round(up/sites.length*100)}% of monitored sites` : 'Awaiting first check'} tone="green"/>
        <Stat icon={<XCircle/>} label="OFFLINE" value={down} detail={down ? 'Needs attention' : 'No known incidents'} tone="red"/>
        <Stat icon={<Clock3/>} label="AVG. RESPONSE" value={avg === null ? '—' : `${avg} ms`} detail="Across online sites" tone="gold"/>
      </div>
      <section className="panel add-site-panel">
        <div className="panel-head"><div><h3>Admin · Add a website</h3><p>Register a site directly from this dashboard using your admin password.</p></div><button className="primary-btn" type="button" onClick={() => { setShowAddSite(v => !v); setSiteMessage(''); }}><Plus size={15}/>{showAddSite ? 'Close' : 'Add website'}</button></div>
        {showAddSite && <form className="admin-site-form" onSubmit={addSite}>
          <label htmlFor="site-name">Website name</label><input id="site-name" value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="TEDDY-XMD Pairing" maxLength={100} required/>
          <label htmlFor="site-url">Website URL</label><input id="site-url" type="url" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://example.com" required/>
          <label htmlFor="admin-password">Admin password</label><input id="admin-password" type="password" autoComplete="current-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Enter admin password" required/>
          <button className="primary-btn" type="submit" disabled={savingSite}><Plus size={15}/>{savingSite ? 'Saving website…' : 'Save website'}</button>
        </form>}
        {siteMessage && <p className={siteMessage.includes('successfully') ? 'field-success' : 'field-error'} role="status">{siteMessage}</p>}
      </section>
      <section className="panel sites-panel">
        <div className="panel-head"><div><h3>Monitored websites</h3><p>Uptime status and latest response checks</p></div><span className="count-pill">{sites.length} SITES</span></div>
        {loading ? <div className="empty"><LoaderCircle className="spin" size={25}/><p>Loading monitored sites…</p></div> : sites.length === 0 ? <div className="empty"><div className="empty-icon"><Globe2 size={23}/></div><h4>No monitored sites yet</h4><p>Add your first website using the password-protected admin panel above.</p><button className="subtle-btn" onClick={() => setShowAddSite(true)}>Add a website <ArrowUpRight size={15}/></button></div> :
          <div className="site-list">{sites.map(s => <div className="site-row" key={s.id}><div className={`site-favicon ${s.status}`}><Globe2 size={18}/></div><div className="site-details"><b>{s.name}</b><a href={s.url} target="_blank" rel="noreferrer">{s.url} <ExternalLink size={11}/></a></div><div className="site-latency">{s.latencyMs == null ? '—' : `${s.latencyMs} ms`}<small>{s.lastCheck ? new Date(s.lastCheck).toLocaleTimeString() : 'Not checked'}</small></div><Status status={s.status}/></div>)}</div>}
        <div className="panel-foot"><span><span className="live-dot"/> Auto-refresh enabled</span><span>Checks scheduled externally</span></div>
      </section>
      <section className="ad-section" id="ad-preview">
        <div className="ad-copy"><div className="ad-icon"><Eye size={21}/></div><div><div className="eyebrow">OPTIONAL TOOL</div><h2>Ad preview studio</h2><p>Preview a publisher-approved landing page or ad creative URL on demand. No automatic ad views, clicks, or impression generation.</p></div></div>
        <form className="ad-form" onSubmit={previewAd}><label htmlFor="adurl">Preview URL</label><div className="url-input"><ExternalLink size={16}/><input id="adurl" value={adUrl} onChange={e => setAdUrl(e.target.value)} placeholder="https://example.com/creative" type="url"/><button className="primary-btn" type="submit"><Eye size={15}/> Preview</button></div>{adError && <p className="field-error">{adError}</p>}</form>
        {showAd && <div className="preview-wrap"><div className="preview-head"><span>PREVIEW FRAME</span><button className="subtle-btn" onClick={() => setShowAd(false)} type="button">Close <XCircle size={14}/></button></div><iframe title="On-demand ad preview" src={adUrl} sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" loading="lazy"/><p className="preview-note">If the site blocks embedding, open the URL in a new tab. Do not use this preview to manufacture paid ad impressions.</p></div>}
      </section>
      <footer><div className="footer-brand"><div className="brand-mark small"><Zap size={14}/></div><b>TEDDY-XMD <span>AutoPing</span></b></div><span>Simple uptime visibility. Built for the web.</span><span className="footer-version">v1.0.0</span></footer>
    </main>
  </div>;
}

function Stat({icon,label,value,detail,tone}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}>{React.cloneElement(icon,{size:18})}</div></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div><div className={`stat-accent ${tone}`}/></div>; }
function Status({status}) { const label = status === 'up' ? 'Online' : status === 'down' ? 'Offline' : 'Unknown'; return <span className={`status ${status}`}><i/>{label}</span>; }
createRoot(document.getElementById('root')).render(<App/>);
