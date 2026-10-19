## canvas-prototyping

Regra obrigatória de Prototipagem Visual no Canvas antes de codificar telas:

1. **Protótipo Visual Primeiro:** Sempre que for criar uma tela nova, página, modal ou redesign visual significativo, a IA DEVE gerar primeiro um protótipo visual interativo no Canvas (HTML + Tailwind com alternador Mobile/Desktop) para o usuário validar e aprovar o design.
2. **Proibição de Código Cego:** É proibido escrever ou alterar código final de telas novas antes que o usuário aprove o protótipo visual.
3. **Ergonomia Mobile:** O protótipo deve ser Mobile-First (360px a 430px), sem scroll horizontal e com alvos de toque mínimos de 44x44px.
4. **Ciclo de 1 Clique:** O card do protótipo deve conter os botões `⚡ Aprovar e Gerar Código` e `💬 Pedir Ajustes`.
