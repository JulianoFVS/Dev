#!/usr/bin/env bash
# Reinicia o ambiente local de teste (banco em memória refeito do zero).
cd "$(dirname "$0")"
./parar.sh 54321 54322 > /dev/null
sleep 1
(node servidor.mjs > servidor.log 2>&1 &)
for i in $(seq 1 60); do
  if grep -q "ambiente de teste no ar" servidor.log 2>/dev/null; then tail -1 servidor.log | cut -c1-120; exit 0; fi
  if grep -qi "error\|Migrations com erro" servidor.log 2>/dev/null; then tail -25 servidor.log | cut -c1-220; exit 1; fi
  sleep 1
done
echo "tempo esgotado"; tail -5 servidor.log; exit 1
