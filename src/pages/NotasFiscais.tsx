// 🧾 Notas fiscais (NF-e própria, direto na SEFAZ/SVRS): lista das notas, situação do certificado,
// "Testar conexão com a SEFAZ" (status do serviço) e configuração do emitente/numeração (tabela nfe_config).
// FASE 1: só homologação. A emissão é feita no Histórico de Vendas › botão "Nota fiscal".
import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Download, Wifi, Settings, ShieldCheck, ShieldAlert } from 'lucide-react';
import { NfeNota, NfeCert, STATUS_NFE, nfeGet, nfePost, baixarDanfe, baixarXml } from '../lib/nfeApi';
import { useErpRefresh } from '../lib/erpRefresh';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Config = Record<string, any>;
interface StatusUm { cStat?: string | null; motivo?: string | null; tMed?: string | null; erro?: string }

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const inp = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm';
const lbl = 'block text-xs font-medium text-gray-400 mb-1';
const CAMPOS: [string, string, string][] = [
  ['razao', 'Razão social', 'md:col-span-6'], ['fantasia', 'Nome fantasia', 'md:col-span-3'], ['cnpj', 'CNPJ', 'md:col-span-3'],
  ['ie', 'Inscrição estadual', 'md:col-span-3'], ['crt', 'CRT (1 = Simples Nacional)', 'md:col-span-3'], ['fone', 'Telefone (opcional)', 'md:col-span-3'], ['cep', 'CEP', 'md:col-span-3'],
  ['logradouro', 'Rua', 'md:col-span-6'], ['numero', 'Número', 'md:col-span-2'], ['complemento', 'Complemento', 'md:col-span-4'],
  ['bairro', 'Bairro', 'md:col-span-4'], ['municipio', 'Município', 'md:col-span-4'], ['uf', 'UF', 'md:col-span-1'], ['cod_municipio', 'Cód. IBGE do município', 'md:col-span-3'],
];

export default function NotasFiscais() {
  const [notas, setNotas] = useState<NfeNota[]>([]);
  const [cert, setCert] = useState<NfeCert | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [tpag, setTpag] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [sefaz, setSefaz] = useState<{ homologacao?: StatusUm; producao?: StatusUm; autorizador?: string; erro?: string } | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const j = await nfeGet({ op: 'painel' });
      if (j.erro) throw new Error(j.erro);
      setNotas(j.notas || []); setCert(j.cert || null); setCfg(j.config || null); setTpag(j.tpag || {});
    } catch (e) { setErro(e instanceof Error ? e.message : 'falhou'); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useErpRefresh(carregar);

  const testar = async () => {
    setOcupado('sefaz'); setSefaz(null);
    try { setSefaz(await nfeGet({ op: 'sefaz' })); } catch (e) { setSefaz({ erro: e instanceof Error ? e.message : 'falhou' }); }
    setOcupado('');
  };
  const consultar = async (n: NfeNota) => {
    setOcupado(n.id); setMsg('');
    try { const j = await nfePost({ op: 'consultar', id: n.id }); setMsg(j.erro ? `⚠️ ${j.erro}` : `Nota nº ${n.numero}: ${STATUS_NFE[j.status] || j.status}${j.motivo ? ` — ${j.motivo}` : ''}`); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado(''); carregar();
  };
  const baixar = async (n: NfeNota, tipo: 'pdf' | 'xml') => {
    setOcupado(`${tipo}${n.id}`);
    try { if (tipo === 'pdf') await baixarDanfe(n.id); else await baixarXml(n.id); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado('');
  };
  const salvar = async () => {
    if (!editando) return;
    setOcupado('cfg'); setMsg('');
    try {
      const j = await nfePost({ op: 'config', ...editando });
      if (j.erro) throw new Error(j.erro);
      setMsg('Configuração salva ✓'); setEditando(null); carregar();
    } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado('');
  };
  const setE = (k: string, v: string) => setEditando((c) => (c ? { ...c, emitente: { ...(c.emitente || {}), [k]: v } } : c));
  const setR = (k: string, v: string) => setEditando((c) => (c ? { ...c, emitente: { ...(c.emitente || {}), resp: { ...(c.emitente?.resp || {}), [k]: v } } } : c));
  const linhaStatus = (nome: string, s?: StatusUm) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-300">{nome}</span>
      {!s ? <span className="text-gray-500">—</span> : s.erro ? <span className="text-red-400">✖ {s.erro}</span>
        : <span className={s.cStat === '107' ? 'text-green-400' : 'text-yellow-400'}>{s.cStat === '107' ? '✔' : '⚠'} {s.cStat} — {s.motivo}{s.tMed ? ` (tempo médio ${s.tMed}s)` : ''}</span>}
    </div>
  );

  return (
    <div className="p-8 text-white space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="text-yellow-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold">Notas fiscais</h1>
            <p className="text-sm text-gray-400">NF-e própria direto na SEFAZ (SVRS). Fase de teste: só homologação, sem valor fiscal. Emita pelo Histórico de Vendas › "Nota fiscal".</p>
          </div>
        </div>
        <button type="button" onClick={() => carregar()} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><RefreshCw size={15} />Atualizar</button>
      </div>

      {erro && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{erro}</div>}
      {msg && <div className={`rounded-lg border px-4 py-3 text-sm ${msg.startsWith('⚠️') ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-green-500/50 bg-green-500/10 text-green-200'}`} onClick={() => setMsg('')}>{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2">{cert?.ok ? <ShieldCheck className="text-green-400" size={18} /> : <ShieldAlert className="text-red-400" size={18} />}Certificado digital (A1)</h2>
          {carregando ? <p className="text-sm text-gray-400">Carregando…</p> : !cert ? <p className="text-sm text-gray-400">—</p> : cert.ok ? (
            <div className="text-sm space-y-1">
              <p className="text-green-300">Válido até <b>{cert.validade?.split('-').reverse().join('/')}</b> ({cert.dias} dias){(cert.dias ?? 99) <= 30 && <span className="text-yellow-400"> — vence logo, renove!</span>}</p>
              <p className="text-gray-400">{cert.nome}</p>
              <p className="text-gray-400">CNPJ do certificado: {cert.cnpj || '—'}</p>
            </div>
          ) : <p className="text-sm text-red-300">⚠️ {cert.erro}</p>}
          <p className="text-xs text-gray-500 mt-3">O certificado e a senha ficam só nas variáveis de ambiente da Vercel (NFE_CERT_B64 e NFE_CERT_SENHA). Veja docs/nfe-passo-a-passo.md.</p>
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><Wifi size={18} className="text-blue-400" />Conexão com a SEFAZ</h2>
            <button type="button" disabled={ocupado === 'sefaz'} onClick={testar} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
              <RefreshCw size={14} className={ocupado === 'sefaz' ? 'animate-spin' : ''} />{ocupado === 'sefaz' ? 'Testando…' : 'Testar conexão com a SEFAZ'}
            </button>
          </div>
          {sefaz?.erro ? <p className="text-sm text-red-300">⚠️ {sefaz.erro}</p> : sefaz ? (
            <div>
              {linhaStatus('Homologação (teste)', sefaz.homologacao)}
              {linhaStatus('Produção', sefaz.producao)}
              <p className="text-xs text-gray-500 mt-2">Autorizador: {sefaz.autorizador || '—'}. 107 = serviço em operação.</p>
            </div>
          ) : <p className="text-sm text-gray-400">Consulta o status do serviço (NFeStatusServico4) com o certificado. Não emite nada.</p>}
        </section>
      </div>

      <section className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold flex items-center gap-2"><Settings size={18} className="text-orange-400" />Emitente e numeração</h2>
          {cfg && !editando && <button type="button" onClick={() => setEditando(JSON.parse(JSON.stringify(cfg)))} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-semibold">Editar</button>}
        </div>
        {!cfg ? <p className="text-sm text-gray-400">{carregando ? 'Carregando…' : 'Sem configuração (a migration das notas fiscais foi aplicada?)'}</p> : !editando ? (
          <div className="text-sm text-gray-300 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <p><span className="text-gray-500">Empresa:</span> {cfg.emitente?.razao} ({cfg.emitente?.fantasia})</p>
            <p><span className="text-gray-500">CNPJ / IE:</span> {cfg.emitente?.cnpj} / {cfg.emitente?.ie} · CRT {cfg.emitente?.crt}</p>
            <p><span className="text-gray-500">Endereço:</span> {cfg.emitente?.logradouro}, {cfg.emitente?.numero}{cfg.emitente?.complemento ? ` - ${cfg.emitente.complemento}` : ''}, {cfg.emitente?.bairro}</p>
            <p><span className="text-gray-500">Cidade:</span> {cfg.emitente?.municipio}/{cfg.emitente?.uf} · CEP {cfg.emitente?.cep} · IBGE {cfg.emitente?.cod_municipio}</p>
            <p><span className="text-gray-500">Série:</span> {cfg.serie} · <span className="text-gray-500">próximo nº de teste:</span> {cfg.proximo_homolog}</p>
            <p><span className="text-gray-500">Natureza:</span> {cfg.natop}</p>
            <p><span className="text-gray-500">Tributos aprox. (IBPT):</span> {String(cfg.ibpt_fed).replace('.', ',')}% federal · {String(cfg.ibpt_est).replace('.', ',')}% estadual</p>
            <p><span className="text-gray-500">Pagamento na nota:</span> {cfg.tpag} — {tpag[cfg.tpag] || ''}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              {CAMPOS.map(([k, r, w]) => (
                <div key={k} className={`col-span-12 ${w}`}>
                  <label className={lbl}>{r}</label>
                  <input className={inp} value={editando.emitente?.[k] ?? ''} onChange={(e) => setE(k, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6 md:col-span-2"><label className={lbl}>Série</label><input className={inp} value={editando.serie} onChange={(e) => setEditando({ ...editando, serie: e.target.value })} /></div>
              <div className="col-span-6 md:col-span-3"><label className={lbl}>Próximo nº (teste)</label><input className={inp} value={editando.proximo_homolog} onChange={(e) => setEditando({ ...editando, proximo_homolog: e.target.value })} /></div>
              <div className="col-span-12 md:col-span-7"><label className={lbl}>Natureza da operação</label><input className={inp} value={editando.natop} onChange={(e) => setEditando({ ...editando, natop: e.target.value })} /></div>
              <div className="col-span-6 md:col-span-3"><label className={lbl}>% tributos federais (IBPT)</label><input className={inp} value={String(editando.ibpt_fed).replace('.', ',')} onChange={(e) => setEditando({ ...editando, ibpt_fed: e.target.value })} /></div>
              <div className="col-span-6 md:col-span-3"><label className={lbl}>% tributos estaduais (IBPT)</label><input className={inp} value={String(editando.ibpt_est).replace('.', ',')} onChange={(e) => setEditando({ ...editando, ibpt_est: e.target.value })} /></div>
              <div className="col-span-12 md:col-span-6">
                <label className={lbl}>Forma de pagamento na nota</label>
                <select className={inp} value={editando.tpag} onChange={(e) => setEditando({ ...editando, tpag: e.target.value })}>
                  {Object.entries(tpag).map(([k, r]) => <option key={k} value={k}>{k} — {r}{k === '90' ? ' (igual ao Tiny)' : ''}</option>)}
                </select>
              </div>
              <div className="col-span-12"><label className={lbl}>Frase fixa nas informações complementares (vai depois dos tributos aproximados)</label><input className={inp} value={editando.info} onChange={(e) => setEditando({ ...editando, info: e.target.value })} /></div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Responsável técnico (opcional; só vai na nota se nome, e-mail e telefone estiverem preenchidos — preencha se a SEFAZ pedir, rejeição 972)</p>
              <div className="grid grid-cols-12 gap-3">
                {[['cnpj', 'CNPJ (vazio = o da empresa)'], ['contato', 'Nome do contato'], ['email', 'E-mail'], ['fone', 'Telefone']].map(([k, r]) => (
                  <div key={k} className="col-span-12 md:col-span-3"><label className={lbl}>{r}</label><input className={inp} value={editando.emitente?.resp?.[k] ?? ''} onChange={(e) => setR(k, e.target.value)} /></div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={ocupado === 'cfg'} onClick={salvar} className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 px-5 py-2 rounded-lg font-semibold">{ocupado === 'cfg' ? 'Salvando…' : 'Salvar'}</button>
              <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Cancelar</button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h2 className="font-bold mb-3">Notas emitidas</h2>
        {carregando ? <p className="text-sm text-gray-400">Carregando…</p> : !notas.length ? <p className="text-sm text-gray-400">Nenhuma nota ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
                <th className="py-2 pr-3">Nº / série</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3 text-right">Valor</th><th className="py-2 pr-3">Situação</th><th className="py-2" />
              </tr></thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id} className="border-b border-gray-700/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{n.numero} / {n.serie}{n.ambiente === 2 && <span className="ml-1 text-xs text-yellow-400">teste</span>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-300">{dataHora(n.autorizada_em || n.criado_em)}</td>
                    <td className="py-2 pr-3">{n.cliente}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{brl(n.valor)}</td>
                    <td className="py-2 pr-3">{STATUS_NFE[n.status] || n.status}{['rejeitada', 'pendente'].includes(n.status) && n.motivo && <span className="block text-xs text-gray-400">{n.cstat ? `${n.cstat}: ` : ''}{n.motivo}</span>}</td>
                    <td className="py-2 whitespace-nowrap text-right space-x-1">
                      {['autorizada', 'cancelada'].includes(n.status) && <>
                        <button type="button" disabled={!!ocupado} onClick={() => baixar(n, 'pdf')} className="bg-green-700 hover:bg-green-600 disabled:bg-gray-600 px-2.5 py-1 rounded text-xs inline-flex items-center gap-1"><Download size={12} />DANFE</button>
                        <button type="button" disabled={!!ocupado} onClick={() => baixar(n, 'xml')} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-2.5 py-1 rounded text-xs inline-flex items-center gap-1"><Download size={12} />XML</button>
                      </>}
                      {['pendente', 'emitindo'].includes(n.status) && <button type="button" disabled={!!ocupado} onClick={() => consultar(n)} className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 px-2.5 py-1 rounded text-xs inline-flex items-center gap-1"><RefreshCw size={12} className={ocupado === n.id ? 'animate-spin' : ''} />Consultar SEFAZ</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
