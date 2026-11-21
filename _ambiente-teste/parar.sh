#!/usr/bin/env bash
# Encerra o que estiver ouvindo nas portas do ambiente de teste.
for porta in "$@"; do
  pid=$(netstat -ano 2>/dev/null | grep -E "127\.0\.0\.1:${porta}\s|0\.0\.0\.0:${porta}\s|\[::\]:${porta}\s|\[::1\]:${porta}\s" | grep LISTENING | awk '{print $NF}' | head -1)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then taskkill //F //PID "$pid" > /dev/null 2>&1 && echo "porta $porta: processo $pid encerrado"; fi
done
