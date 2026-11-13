// 🧾 Regras do modal da NF-e própria sem banco nem rede (testadas em scripts/tests/nfe.test.ts).
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// NCM do brinde: vem do cadastro de Acessórios (coluna accessories.ncm). Brinde digitado à mão
// (custom_name, sem acessório cadastrado) ou acessório sem NCM fica vazio, e a nota trava.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ncmDoBrinde = (saleAccessory: any): string => {
  const ac = Array.isArray(saleAccessory?.accessories) ? saleAccessory.accessories[0] : saleAccessory?.accessories;
  return dig(ac?.ncm);
};

// itens sem NCM válido (8 números): nome de cada um, para dizer qual trava a nota
export const itensSemNcm = (itens: { nome?: string; ncm?: unknown }[]): string[] =>
  itens.map((i, k) => ({ i, k })).filter(({ i }) => !/^\d{8}$/.test(dig(i.ncm))).map(({ i, k }) => i.nome || `item ${k + 1}`);

// cliente fora do RJ: a nota sai com CFOP 6102 (interestadual) e o botão só libera depois de marcar "Conferi"
export const AVISO_FORA_RJ = 'Cliente de fora do RJ: a nota sai com CFOP 6102 (operação interestadual). Confira antes de emitir.';
export const foraDoRj = (uf: unknown) => { const u = String(uf ?? '').trim().toUpperCase(); return u !== '' && u !== 'RJ'; };
export const podeEmitirUf = (uf: unknown, conferiu: boolean) => !foraDoRj(uf) || conferiu;
