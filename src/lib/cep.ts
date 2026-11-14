// CEP: aceita colar "24.030-330", "24030-330", "24030330" ou com espaços. Grava só os números (até 8 dígitos) e
// mostra como 00000-000 no campo. Testes: node scripts/tests/cep.test.ts
export const cleanCep = (v: unknown): string => String(v ?? '').replace(/\D/g, '').slice(0, 8);

export const formatCep = (v: unknown): string => {
  const d = cleanCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
