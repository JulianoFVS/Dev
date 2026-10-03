export function apenasDigitos(valor: string, max?: number) {
  const digitos = valor.replace(/\D/g, '');
  return max ? digitos.slice(0, max) : digitos;
}

/** 012.345.678.91 */
export function mascaraCpf(valor: string) {
  const d = apenasDigitos(valor, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}.${d.slice(9)}`;
}

/** Formas em que o CPF pode já estar gravado. */
export function variantesCpf(valor: string) {
  const d = apenasDigitos(valor, 11);
  if (d.length !== 11) return [valor];
  const base = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}`;
  return [valor, d, `${base}.${d.slice(9)}`, `${base}-${d.slice(9)}`];
}

export function cpfValido(valor: string) {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** (11)9 1234-7598 — celular. Fixo fica (11)1234-5678. */
export function mascaraTelefone(valor: string) {
  const d = apenasDigitos(valor, 11);
  if (d.length === 0) return '';
  if (d.length < 3) return `(${d}`;
  if (d.length <= 10) {
    const meio = d.slice(2);
    if (meio.length <= 4) return `(${d.slice(0, 2)})${meio}`;
    return `(${d.slice(0, 2)})${meio.slice(0, 4)}-${meio.slice(4)}`;
  }
  return `(${d.slice(0, 2)})${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 00000-000 */
export function mascaraCep(valor: string) {
  const d = apenasDigitos(valor, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function mascaraNumero(valor: string) {
  return apenasDigitos(valor, 10);
}
