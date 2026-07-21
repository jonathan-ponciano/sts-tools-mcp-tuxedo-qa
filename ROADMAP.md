# Roadmap

## Planejado (não implementar ainda)

- **Login + banco de dados.** Hoje o dashboard roda sem autenticação de propósito — é pra rodar localmente, uma instância por máquina/pessoa, sem estado compartilhado. Quando (se) isso mudar pra uma instância compartilhada entre várias pessoas, vai precisar de: autenticação de usuário, um banco de dados de verdade (em vez dos arquivos JSON em `config/`/`results/` por projeto) pra guardar usuários e testes, e um jeito de saber quem fez o quê (audit trail). Não começar isso sem validar primeiro que o time realmente vai usar de forma compartilhada — ver `[[feedback_preflight_questions_before_tests]]` e o plano de validação interna em andamento.
