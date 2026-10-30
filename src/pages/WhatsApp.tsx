import { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageCircle, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X,
  Search, Copy, Download, FileText, Mic, Image as ImageIcon, Video, File,
  Flame, Upload, AlertTriangle, Folder, Tag, Users, Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemType = 'texto' | 'audio' | 'imagem' | 'video' | 'documento';
type Filter   = 'tudo' | ItemType | 'mais_usadas';

interface WaCategory {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

interface WaItem {
  id: string;
  category_id: string;
  type: ItemType;
  title: string;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  usage_count: number;
  position: number;
  created_at: string;
  record_seconds?: number | null;
}

interface ItemForm {
  id?: string;
  category_id: string;
  type: ItemType;
  title: string;
  body: string;
  file: File | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  record_seconds: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const ORANGE    = '#f97316';
const BUCKET    = 'wa-media';
const MAX_BYTES = 50 * 1024 * 1024;

const TYPE_CFG: Record<ItemType, { label: string; icon: typeof FileText; color: string; accept: string }> = {
  texto:     { label: 'Texto',     icon: FileText,  color: '#22c55e', accept: '' },
  audio:     { label: 'Áudio',     icon: Mic,       color: '#a855f7', accept: 'audio/*' },
  imagem:    { label: 'Imagem',    icon: ImageIcon, color: '#3b82f6', accept: 'image/*' },
  video:     { label: 'Vídeo',     icon: Video,     color: '#ef4444', accept: 'video/*' },
  documento: { label: 'Documento', icon: File,      color: '#eab308', accept: '' },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'tudo',        label: 'Tudo' },
  { id: 'texto',       label: 'Texto' },
  { id: 'audio',       label: 'Áudio' },
  { id: 'imagem',      label: 'Imagem' },
  { id: 'video',       label: 'Vídeo' },
  { id: 'documento',   label: 'Documento' },
  { id: 'mais_usadas', label: 'Mais usadas' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(url.slice(idx + marker.length)) : null;
}

function sanitizeFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Destaca variáveis como {nome}, {produto}, {rastreio}
function renderWithVars(text: string) {
  return text.split(/(\{[^{}\s]+\})/g).map((part, i) =>
    /^\{[^{}\s]+\}$/.test(part)
      ? <span key={i} style={{ color: ORANGE, fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  );
}

const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
};

const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function WhatsApp() {
  const [categories, setCategories] = useState<WaCategory[]>([]);
  const [items, setItems]           = useState<WaItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<Filter>('tudo');

  const [newCatName, setNewCatName]     = useState('');
  const [addingCat, setAddingCat]       = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  const [form, setForm]     = useState<ItemForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'respostas' | 'etiquetas'>('respostas');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const [catRes, itemRes] = await Promise.all([
      supabase.from('wa_categories').select('*').order('position').order('created_at'),
      supabase.from('wa_items').select('*').order('position').order('created_at'),
    ]);
    if (catRes.error || itemRes.error) {
      setError((catRes.error || itemRes.error)!.message);
    } else {
      setCategories(catRes.data as WaCategory[]);
      setItems(itemRes.data as WaItem[]);
    }
    setLoading(false);
  }

  // ── Categorias ─────────────────────────────────────────────────────────────

  async function createCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const position = categories.length ? Math.max(...categories.map(c => c.position)) + 1 : 0;
    const { data, error } = await supabase.from('wa_categories').insert({ name, position }).select().single();
    if (error) { alert('Erro ao criar categoria: ' + error.message); return; }
    setCategories(prev => [...prev, data as WaCategory]);
    setNewCatName('');
    setAddingCat(false);
    setSelectedCat((data as WaCategory).id);
  }

  async function renameCategory(id: string) {
    const name = editingCatName.trim();
    if (!name) return;
    const { error } = await supabase.from('wa_categories').update({ name }).eq('id', id);
    if (error) { alert('Erro ao renomear: ' + error.message); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    setEditingCatId(null);
  }

  async function deleteCategory(cat: WaCategory) {
    const catItems = items.filter(i => i.category_id === cat.id);
    const msg = catItems.length
      ? `Excluir a categoria "${cat.name}" e seus ${catItems.length} item(ns)?`
      : `Excluir a categoria "${cat.name}"?`;
    if (!confirm(msg)) return;
    const paths = catItems.map(i => i.file_url && storagePathFromUrl(i.file_url)).filter(Boolean) as string[];
    const { error } = await supabase.from('wa_categories').delete().eq('id', cat.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    setCategories(prev => prev.filter(c => c.id !== cat.id));
    setItems(prev => prev.filter(i => i.category_id !== cat.id));
    if (selectedCat === cat.id) setSelectedCat('all');
  }

  async function moveCategory(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withPos = reordered.map((c, i) => ({ ...c, position: i }));
    setCategories(withPos);
    const changed = withPos.filter((c, i) => categories[i].id !== c.id || categories[i].position !== c.position);
    const results = await Promise.all(
      changed.map(c => supabase.from('wa_categories').update({ position: c.position }).eq('id', c.id))
    );
    if (results.some(r => r.error)) { alert('Erro ao reordenar categorias.'); load(); }
  }

  // ── Itens ──────────────────────────────────────────────────────────────────

  function openNewItem() {
    const category_id = selectedCat !== 'all' ? selectedCat : categories[0]?.id;
    if (!category_id) { alert('Crie uma categoria primeiro.'); return; }
    setRecordError(null);
    setForm({ category_id, type: 'texto', title: '', body: '', file: null, file_url: null, file_name: null, file_size: null, record_seconds: '' });
  }

  function openEditItem(item: WaItem) {
    setRecordError(null);
    setForm({
      id: item.id, category_id: item.category_id, type: item.type, title: item.title, body: item.body || '',
      file: null, file_url: item.file_url, file_name: item.file_name, file_size: item.file_size,
      record_seconds: item.record_seconds == null ? '' : String(item.record_seconds),
    });
  }

  async function saveItem() {
    if (!form) return;
    const title = form.title.trim();
    if (!title) { alert('Informe o título.'); return; }
    if (form.type === 'texto' && !form.body.trim()) { alert('Informe o texto da mensagem.'); return; }
    if (form.type !== 'texto' && !form.file && !form.file_url) { alert('Selecione um arquivo.'); return; }

    // Tempo de "gravando áudio…": vazio = automático (null); inteiro de 0 a 60
    let recordSeconds: number | null = null;
    if (form.type === 'audio') {
      const raw = form.record_seconds.trim();
      if (raw !== '') {
        if (!/^\d+$/.test(raw) || Number(raw) > 60) { setRecordError('Use um número inteiro de 0 a 60, ou deixe vazio.'); return; }
        recordSeconds = Number(raw);
      }
    }

    setSaving(true);
    let file_url  = form.type === 'texto' ? null : form.file_url;
    let file_name = form.type === 'texto' ? null : form.file_name;
    let file_size = form.type === 'texto' ? null : form.file_size;
    const original = form.id ? items.find(i => i.id === form.id) : undefined;

    if (form.type !== 'texto' && form.file) {
      const path = `${form.category_id}/${Date.now()}-${sanitizeFileName(form.file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, form.file, {
        contentType: form.file.type || undefined,
      });
      if (upErr) { setSaving(false); alert('Erro no upload: ' + upErr.message); return; }
      file_url  = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      file_name = form.file.name;
      file_size = form.file.size;
    }

    const payload = {
      category_id: form.category_id, type: form.type, title, body: form.body.trim() || null, file_url, file_name, file_size,
      // Só áudio leva a coluna nova: salvar os outros tipos não depende dela
      ...(form.type === 'audio' ? { record_seconds: recordSeconds } : {}),
    };

    if (form.id) {
      const { data, error } = await supabase.from('wa_items').update(payload).eq('id', form.id).select().single();
      if (error) { setSaving(false); alert('Erro ao salvar: ' + error.message); return; }
      setItems(prev => prev.map(i => i.id === form.id ? data as WaItem : i));
    } else {
      const sameCat = items.filter(i => i.category_id === form.category_id);
      const position = sameCat.length ? Math.max(...sameCat.map(i => i.position)) + 1 : 0;
      const { data, error } = await supabase.from('wa_items').insert({ ...payload, position }).select().single();
      if (error) { setSaving(false); alert('Erro ao salvar: ' + error.message); return; }
      setItems(prev => [...prev, data as WaItem]);
    }

    // Remove o arquivo antigo se foi substituído ou se o item virou texto
    if (original?.file_url && original.file_url !== file_url) {
      const oldPath = storagePathFromUrl(original.file_url);
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    setSaving(false);
    setForm(null);
  }

  async function deleteItem(item: WaItem) {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    const { error } = await supabase.from('wa_items').delete().eq('id', item.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    const path = item.file_url && storagePathFromUrl(item.file_url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    setItems(prev => prev.filter(i => i.id !== item.id));
  }

  async function incrementUsage(item: WaItem) {
    const usage_count = item.usage_count + 1;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, usage_count } : i));
    await supabase.from('wa_items').update({ usage_count }).eq('id', item.id);
  }

  async function copyText(item: WaItem) {
    try {
      await navigator.clipboard.writeText(item.body || '');
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(c => c === item.id ? null : c), 1500);
      incrementUsage(item);
    } catch {
      alert('Não foi possível copiar.');
    }
  }

  async function downloadFile(item: WaItem) {
    if (!item.file_url) return;
    const path = storagePathFromUrl(item.file_url);
    if (!path) return;
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) { alert('Erro ao baixar: ' + (error?.message || '')); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.file_name || path.split('/').pop() || 'arquivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    incrementUsage(item);
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  const catPosition = useMemo(() => new Map(categories.map(c => [c.id, c.position])), [categories]);
  const catName     = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter(i =>
      (selectedCat === 'all' || i.category_id === selectedCat) &&
      (!q || i.title.toLowerCase().includes(q))
    );
    if (filter === 'mais_usadas') {
      list = list.filter(i => i.usage_count > 0).sort((a, b) => b.usage_count - a.usage_count);
    } else {
      if (filter !== 'tudo') list = list.filter(i => i.type === filter);
      list = [...list].sort((a, b) =>
        (catPosition.get(a.category_id) ?? 0) - (catPosition.get(b.category_id) ?? 0) || a.position - b.position
      );
    }
    return list;
  }, [items, selectedCat, search, filter, catPosition]);

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => m.set(i.category_id, (m.get(i.category_id) || 0) + 1));
    return m;
  }, [items]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const formFileSize = form?.file ? form.file.size : form?.file_size ?? null;
  const formTooBig   = formFileSize != null && formFileSize > MAX_BYTES;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <MessageCircle size={28} color={ORANGE} />
            WhatsApp
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Biblioteca de mensagens, áudios e mídias</p>
        </div>
        {tab === 'respostas' && (
          <button onClick={openNewItem}
            style={{ ...btnBase, padding: '9px 18px', fontSize: 13, background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff' }}>
            <Plus size={14} /> Novo item
          </button>
        )}
      </div>

      {/* ── Abas ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-main)' }}>
        {([['respostas', 'Respostas rápidas', MessageCircle], ['etiquetas', 'Etiquetas', Tag]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'transparent', border: 'none', marginBottom: -1,
              borderBottom: tab === id ? `2px solid ${ORANGE}` : '2px solid transparent',
              color: tab === id ? ORANGE : 'var(--text-muted)' }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'etiquetas' ? <LabelsTab /> : (<>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
          <AlertTriangle size={15} /> Erro ao carregar: {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Categorias ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 14, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>CATEGORIAS</span>
            <button onClick={() => { setAddingCat(true); setNewCatName(''); }} title="Nova categoria" style={{ ...iconBtn, color: ORANGE }}>
              <Plus size={15} />
            </button>
          </div>

          {addingCat && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
              <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nome da categoria"
                onKeyDown={e => { if (e.key === 'Enter') createCategory(); if (e.key === 'Escape') setAddingCat(false); }}
                style={{ ...inputStyle, padding: '6px 10px' }} />
              <button onClick={createCategory} style={{ ...iconBtn, color: '#22c55e' }}><Check size={14} /></button>
              <button onClick={() => setAddingCat(false)} style={iconBtn}><X size={14} /></button>
            </div>
          )}

          <CategoryRow active={selectedCat === 'all'} onClick={() => setSelectedCat('all')}
            label="Todas" count={items.length} />

          {categories.map((cat, idx) => (
            editingCatId === cat.id ? (
              <div key={cat.id} style={{ display: 'flex', gap: 4, margin: '2px 0', alignItems: 'center' }}>
                <input autoFocus value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameCategory(cat.id); if (e.key === 'Escape') setEditingCatId(null); }}
                  style={{ ...inputStyle, padding: '6px 10px' }} />
                <button onClick={() => renameCategory(cat.id)} style={{ ...iconBtn, color: '#22c55e' }}><Check size={14} /></button>
                <button onClick={() => setEditingCatId(null)} style={iconBtn}><X size={14} /></button>
              </div>
            ) : (
              <CategoryRow key={cat.id} active={selectedCat === cat.id} onClick={() => setSelectedCat(cat.id)}
                label={cat.name} count={countByCat.get(cat.id) || 0}
                actions={
                  <>
                    <button title="Subir" disabled={idx === 0} onClick={e => { e.stopPropagation(); moveCategory(idx, -1); }}
                      style={{ ...iconBtn, opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={13} /></button>
                    <button title="Descer" disabled={idx === categories.length - 1} onClick={e => { e.stopPropagation(); moveCategory(idx, 1); }}
                      style={{ ...iconBtn, opacity: idx === categories.length - 1 ? 0.3 : 1 }}><ChevronDown size={13} /></button>
                    <button title="Renomear" onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                      style={iconBtn}><Pencil size={12} /></button>
                    <button title="Excluir" onClick={e => { e.stopPropagation(); deleteCategory(cat); }}
                      style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={12} /></button>
                  </>
                } />
            )
          ))}

          {!loading && categories.length === 0 && !addingCat && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 6px' }}>Nenhuma categoria. Clique em + para criar.</p>
          )}
        </div>

        {/* ── Itens ── */}
        <div>
          <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título..."
                style={{ ...inputStyle, paddingLeft: 34 }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: filter === f.id ? ORANGE : 'var(--bg-hover)',
                    border: filter === f.id ? `1px solid ${ORANGE}` : '1px solid var(--border-main)',
                    color: filter === f.id ? '#fff' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {f.id === 'mais_usadas' && <Flame size={12} />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Carregando...</p>
          ) : visibleItems.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-main)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
              <Folder size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {filter === 'mais_usadas' ? 'Nenhum item usado ainda.' : 'Nenhum item encontrado.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {visibleItems.map(item => (
                <ItemCard key={item.id} item={item}
                  categoryName={selectedCat === 'all' ? catName.get(item.category_id) : undefined}
                  copied={copiedId === item.id}
                  onCopy={() => copyText(item)}
                  onDownload={() => downloadFile(item)}
                  onEdit={() => openEditItem(item)}
                  onDelete={() => deleteItem(item)} />
              ))}
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* ── Modal de item ── */}
      {form && (
        <div onClick={() => !saving && setForm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {form.id ? 'Editar item' : 'Novo item'}
              </h2>
              <button onClick={() => !saving && setForm(null)} style={iconBtn}><X size={16} /></button>
            </div>

            <Field label="Categoria">
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={inputStyle}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>

            <Field label="Tipo">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(TYPE_CFG) as ItemType[]).map(t => {
                  const cfg = TYPE_CFG[t];
                  const Icon = cfg.icon;
                  const active = form.type === t;
                  return (
                    <button key={t} type="button"
                      onClick={() => setForm({ ...form, type: t, file: t === form.type ? form.file : null })}
                      style={{ ...btnBase, padding: '6px 12px',
                        background: active ? `${cfg.color}22` : 'var(--bg-hover)',
                        border: `1px solid ${active ? cfg.color : 'var(--border-main)'}`,
                        color: active ? cfg.color : 'var(--text-muted)' }}>
                      <Icon size={13} /> {cfg.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Título">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Boas-vindas" style={inputStyle} />
            </Field>

            <Field label={form.type === 'texto' ? 'Mensagem' : 'Legenda (opcional)'}>
              <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={form.type === 'texto' ? 6 : 3}
                placeholder="Olá {nome}! Seu {produto} já foi enviado. Rastreio: {rastreio}"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Variáveis aceitas: {'{nome}'}, {'{produto}'}, {'{rastreio}'}
              </p>
            </Field>

            {form.type !== 'texto' && (
              <Field label="Arquivo">
                <input ref={fileInputRef} type="file" accept={TYPE_CFG[form.type].accept || undefined} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0] || null; setForm({ ...form, file: f }); e.target.value = ''; }} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ ...btnBase, width: '100%', justifyContent: 'center', padding: '12px', background: 'var(--bg-inner)',
                    border: '1px dashed var(--border-main)', color: 'var(--text-secondary)' }}>
                  <Upload size={14} />
                  {form.file || form.file_url ? 'Trocar arquivo' : 'Selecionar arquivo'}
                </button>
                {(form.file || form.file_name) && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, wordBreak: 'break-all' }}>
                    {form.file ? form.file.name : form.file_name}
                    {formFileSize != null && <span style={{ color: 'var(--text-muted)' }}> · {formatSize(formFileSize)}</span>}
                  </p>
                )}
                {formTooBig && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6, padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308', fontSize: 12 }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    Arquivo acima de 50 MB. O upload pode falhar e o envio pelo WhatsApp pode ser recusado.
                  </div>
                )}
              </Field>
            )}

            {form.type === 'audio' && (
              <Field label="Tempo de 'gravando áudio…' (segundos)">
                <input type="number" min={0} max={60} step={1} inputMode="numeric" value={form.record_seconds}
                  onChange={e => { setForm({ ...form, record_seconds: e.target.value }); setRecordError(null); }}
                  placeholder="Automático" style={inputStyle} />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Vazio = automático (tamanho do áudio, entre 2 e 8 s). 0 = envia na hora. Máximo 60.
                </p>
                {recordError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{recordError}</p>}
              </Field>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setForm(null)} disabled={saving}
                style={{ ...btnBase, padding: '9px 16px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={saveItem} disabled={saving}
                style={{ ...btnBase, padding: '9px 16px', background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                <Check size={14} /> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function CategoryRow({ active, onClick, label, count, actions }: {
  active: boolean; onClick: () => void; label: string; count: number; actions?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', margin: '2px 0',
        background: active ? 'rgba(249,115,22,0.12)' : hover ? 'var(--bg-hover)' : 'transparent',
        borderLeft: active ? `2px solid ${ORANGE}` : '2px solid transparent' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: active ? ORANGE : 'var(--text-primary)' }}>{label}</span>
      {actions && hover ? (
        <div style={{ display: 'flex' }}>{actions}</div>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>{count}</span>
      )}
    </div>
  );
}

function ItemCard({ item, categoryName, copied, onCopy, onDownload, onEdit, onDelete }: {
  item: WaItem; categoryName?: string; copied: boolean;
  onCopy: () => void; onDownload: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const cfg  = TYPE_CFG[item.type];
  const Icon = cfg.icon;
  const tooBig = item.file_size != null && item.file_size > MAX_BYTES;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: `${cfg.color}1f`, color: cfg.color }}>
          <Icon size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, wordBreak: 'break-word' }}>{item.title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {cfg.label}{categoryName ? ` · ${categoryName}` : ''} · usado {item.usage_count}x
          </p>
        </div>
        <button title="Editar" onClick={onEdit} style={iconBtn}><Pencil size={13} /></button>
        <button title="Excluir" onClick={onDelete} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
      </div>

      {/* Prévia */}
      {item.type === 'imagem' && item.file_url && (
        <img src={item.file_url} alt={item.title} loading="lazy"
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, background: 'var(--bg-inner)' }} />
      )}
      {item.type === 'video' && item.file_url && (
        <video src={item.file_url} controls preload="metadata" style={{ width: '100%', maxHeight: 200, borderRadius: 10, background: '#000' }} />
      )}
      {item.type === 'audio' && item.file_url && (
        <audio src={item.file_url} controls preload="none" style={{ width: '100%', height: 36 }} />
      )}
      {item.type === 'documento' && item.file_name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-inner)',
          border: '1px solid var(--border-main)', fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          <File size={16} style={{ flexShrink: 0, color: cfg.color }} /> {item.file_name}
        </div>
      )}
      {item.body && (
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'var(--bg-inner)', borderRadius: 10, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
          {renderWithVars(item.body)}
        </div>
      )}

      {/* Rodapé */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
        <span style={{ fontSize: 11, color: tooBig ? '#eab308' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {tooBig && <AlertTriangle size={12} />}
          {item.type !== 'texto' ? formatSize(item.file_size) : ''}
        </span>
        {item.type === 'texto' ? (
          <button onClick={onCopy}
            style={{ ...btnBase, background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.12)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`, color: copied ? '#22c55e' : ORANGE }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
          </button>
        ) : (
          <button onClick={onDownload}
            style={{ ...btnBase, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: ORANGE }}>
            <Download size={13} /> Baixar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

interface WaLabel {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

interface WaContact {
  id: string;
  key: string;
  name: string | null;
  phone: string | null;
}

interface WaContactLabel {
  contact_id: string;
  label_id: string;
}

const LABEL_COLORS = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];

const SUGGESTED_LABELS: [string, string][] = [
  ['Novo lead', '#3b82f6'],
  ['Orçamento enviado', '#eab308'],
  ['Negociando', '#f97316'],
  ['Aguardando pagamento', '#a855f7'],
  ['Venda fechada', '#22c55e'],
  ['Cliente antigo', '#6b7280'],
];

// Texto preto ou branco conforme a cor de fundo
function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
}

function labelErrorMessage(err: { code?: string; message: string }): string {
  return err.code === '23505' ? 'Já existe uma etiqueta com esse nome.' : err.message;
}

// Busca todas as linhas, de 1000 em 1000 (limite por consulta do Supabase)
async function fetchAllRows<T>(table: string, select: string, orderCols: string[]): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(select);
    for (const col of orderCols) query = query.order(col);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data || []) as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

function LabelChip({ label }: { label: WaLabel }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: label.color, color: textOn(label.color), whiteSpace: 'nowrap' }}>
      {label.name}
    </span>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {LABEL_COLORS.map(c => (
        <button key={c} type="button" title={c} onClick={() => onChange(c)}
          style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
            border: value === c ? '2px solid var(--text-primary)' : '2px solid transparent',
            boxShadow: value === c ? '0 0 0 2px var(--bg-card) inset' : 'none' }} />
      ))}
    </div>
  );
}

function LabelsTab() {
  const [labels, setLabels]     = useState<WaLabel[]>([]);
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [links, setLinks]       = useState<WaContactLabel[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [newName, setNewName]     = useState('');
  const [newColor, setNewColor]   = useState(LABEL_COLORS[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState('');
  const [editColor, setEditColor] = useState(LABEL_COLORS[0]);
  const [editError, setEditError] = useState<string | null>(null);

  const [search, setSearch]           = useState('');
  const [labelFilter, setLabelFilter] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [l, c, cl] = await Promise.all([
        fetchAllRows<WaLabel>('wa_labels', 'id, name, color, position, created_at', ['position', 'created_at']),
        fetchAllRows<WaContact>('wa_contacts', 'id, key, name, phone', ['created_at', 'id']),
        fetchAllRows<WaContactLabel>('wa_contact_labels', 'contact_id, label_id', ['contact_id', 'label_id']),
      ]);
      setLabels(l);
      setContacts(c);
      setLinks(cl);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  const countByLabel = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach(l => m.set(l.label_id, (m.get(l.label_id) || 0) + 1));
    return m;
  }, [links]);

  const nameTaken = (name: string, exceptId?: string) =>
    labels.some(l => l.id !== exceptId && l.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function createLabel() {
    const name = newName.trim();
    if (!name) { setFormError('Informe o nome da etiqueta.'); return; }
    if (nameTaken(name)) { setFormError('Já existe uma etiqueta com esse nome.'); return; }
    setCreating(true);
    const position = labels.length ? Math.max(...labels.map(l => l.position)) + 1 : 0;
    const { data, error } = await supabase.from('wa_labels').insert({ name, color: newColor, position })
      .select('id, name, color, position, created_at').single();
    setCreating(false);
    if (error) { setFormError(labelErrorMessage(error)); return; }
    setLabels(prev => [...prev, data as WaLabel]);
    setNewName('');
    setFormError(null);
  }

  async function createSuggested() {
    setCreating(true);
    const rows = SUGGESTED_LABELS.map(([name, color], position) => ({ name, color, position }));
    const { data, error } = await supabase.from('wa_labels').insert(rows).select('id, name, color, position, created_at');
    setCreating(false);
    if (error) { setFormError(labelErrorMessage(error)); return; }
    setLabels((data || []) as WaLabel[]);
  }

  function startEdit(label: WaLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) { setEditError('Informe o nome.'); return; }
    if (nameTaken(name, id)) { setEditError('Já existe uma etiqueta com esse nome.'); return; }
    const { error } = await supabase.from('wa_labels').update({ name, color: editColor }).eq('id', id);
    if (error) { setEditError(labelErrorMessage(error)); return; }
    setLabels(prev => prev.map(l => l.id === id ? { ...l, name, color: editColor } : l));
    setEditingId(null);
  }

  async function moveLabel(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= labels.length) return;
    const reordered = [...labels];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withPos = reordered.map((l, i) => ({ ...l, position: i }));
    setLabels(withPos);
    const changed = withPos.filter((l, i) => labels[i].id !== l.id || labels[i].position !== l.position);
    const results = await Promise.all(changed.map(l => supabase.from('wa_labels').update({ position: l.position }).eq('id', l.id)));
    if (results.some(r => r.error)) { alert('Erro ao reordenar etiquetas.'); load(); }
  }

  async function deleteLabel(label: WaLabel) {
    const n = countByLabel.get(label.id) || 0;
    if (!confirm(`Isso remove a etiqueta de ${n} cliente${n === 1 ? '' : 's'}. Excluir "${label.name}"?`)) return;
    const { error } = await supabase.from('wa_labels').delete().eq('id', label.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    setLabels(prev => prev.filter(l => l.id !== label.id));
    setLinks(prev => prev.filter(l => l.label_id !== label.id));
  }

  // ── Clientes etiquetados ──
  const labelById = useMemo(() => new Map(labels.map(l => [l.id, l])), [labels]);

  const taggedClients = useMemo(() => {
    const byContact = new Map<string, WaLabel[]>();
    links.forEach(link => {
      const label = labelById.get(link.label_id);
      if (!label) return;
      const list = byContact.get(link.contact_id) || [];
      list.push(label);
      byContact.set(link.contact_id, list);
    });
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return contacts
      .filter(c => byContact.has(c.id))
      .map(c => ({ ...c, labels: byContact.get(c.id)!.sort((a, b) => a.position - b.position) }))
      .filter(c => !labelFilter || c.labels.some(l => l.id === labelFilter))
      .filter(c => !q
        || (c.name || '').toLowerCase().includes(q)
        || (qDigits !== '' && (c.phone || '').includes(qDigits)))
      .sort((a, b) => (a.name || a.phone || '').localeCompare(b.name || b.phone || '', 'pt-BR'));
  }, [contacts, links, labelById, search, labelFilter]);

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 14, padding: 16 };
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 };
  const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--border-main)' };
  const td: React.CSSProperties = { padding: 10, borderBottom: '1px solid var(--border-main)', verticalAlign: 'top' };

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Carregando...</p>;

  return (
    <div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
          <AlertTriangle size={15} /> Erro ao carregar: {error}
          <button onClick={load} style={{ ...btnBase, marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
            Tentar de novo
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Lista de etiquetas ── */}
        <div style={cardStyle}>
          <div style={sectionTitle}><Tag size={13} /> ETIQUETAS</div>

          <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input value={newName} onChange={e => { setNewName(e.target.value); setFormError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') createLabel(); }}
                placeholder="Nome da nova etiqueta" style={inputStyle} />
              <button onClick={createLabel} disabled={creating}
                style={{ ...btnBase, background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff', opacity: creating ? 0.6 : 1, flexShrink: 0 }}>
                <Plus size={13} /> Criar
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
            {formError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{formError}</p>}
          </div>

          {labels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Nenhuma etiqueta ainda.</p>
              <button onClick={createSuggested} disabled={creating}
                style={{ ...btnBase, margin: '0 auto', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: ORANGE }}>
                <Sparkles size={13} /> Criar etiquetas sugeridas
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {labels.map((label, idx) => {
                const n = countByLabel.get(label.id) || 0;
                if (editingId === label.id) {
                  return (
                    <div key={label.id} style={{ padding: 10, borderRadius: 10, border: `1px solid ${ORANGE}`, background: 'var(--bg-inner)' }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                        <input autoFocus value={editName} onChange={e => { setEditName(e.target.value); setEditError(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(label.id); if (e.key === 'Escape') setEditingId(null); }}
                          style={{ ...inputStyle, padding: '6px 10px' }} />
                        <button onClick={() => saveEdit(label.id)} title="Salvar" style={{ ...iconBtn, color: '#22c55e' }}><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} title="Cancelar" style={iconBtn}><X size={14} /></button>
                      </div>
                      <ColorPicker value={editColor} onChange={setEditColor} />
                      {editError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{editError}</p>}
                    </div>
                  );
                }
                return (
                  <div key={label.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 10px', borderRadius: 10,
                    background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: label.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{n} cliente{n === 1 ? '' : 's'}</span>
                    <button title="Subir" disabled={idx === 0} onClick={() => moveLabel(idx, -1)}
                      style={{ ...iconBtn, opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={13} /></button>
                    <button title="Descer" disabled={idx === labels.length - 1} onClick={() => moveLabel(idx, 1)}
                      style={{ ...iconBtn, opacity: idx === labels.length - 1 ? 0.3 : 1 }}><ChevronDown size={13} /></button>
                    <button title="Editar" onClick={() => startEdit(label)} style={iconBtn}><Pencil size={12} /></button>
                    <button title="Excluir" onClick={() => deleteLabel(label)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Clientes etiquetados ── */}
        <div style={cardStyle}>
          <div style={sectionTitle}><Users size={13} /> CLIENTES ETIQUETADOS</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..."
                style={{ ...inputStyle, paddingLeft: 34 }} />
            </div>
            <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 200px' }}>
              <option value="">Todas as etiquetas</option>
              {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {taggedClients.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
              {links.length === 0
                ? 'Nenhum cliente etiquetado ainda. Marque as conversas pelo painel da extensão no WhatsApp Web.'
                : 'Nenhum cliente encontrado.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>
                    <th style={th}>NOME</th>
                    <th style={th}>TELEFONE</th>
                    <th style={th}>ETIQUETAS</th>
                  </tr>
                </thead>
                <tbody>
                  {taggedClients.map(c => (
                    <tr key={c.id}>
                      <td style={{ ...td, color: 'var(--text-primary)' }}>
                        {c.name || '—'}
                        {c.key.startsWith('nome:') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#eab308', marginTop: 3 }}>
                            <AlertTriangle size={11} /> identificado só pelo nome
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {c.labels.map(l => <LabelChip key={l.id} label={l} />)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                {taggedClients.length} cliente{taggedClients.length === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
