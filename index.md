---
layout: default
title: Home
---

<div class="terminal">
  <p><span class="prompt">root@0ni0n__T:~#</span> whoami</p>
  <p class="out">0ni0n__T</p>
  <p><span class="prompt">root@0ni0n__T:~#</span> cat goal.txt</p>
  <p class="out">AWS 취업 — 클라우드 보안</p>
  <p><span class="prompt">root@0ni0n__T:~#</span> echo $MOTTO</p>
  <p class="out">모르는 것을 배우기 위해 노력하겠습니다</p>
</div>

배우면서 정리한 것을 남기는 보안 블로그입니다. [About]({{ '/about/' | relative_url }}) · [클라우드 보안 로드맵]({{ '/roadmap/' | relative_url }})

## 카테고리

<ul class="cat-grid">
  <li><a href="{{ '/categories/dev/' | relative_url }}">개발</a><p>만들면서 배운 것, 코드와 설계 기록</p></li>
  <li><a href="{{ '/categories/ctf-wargame/' | relative_url }}">CTF / Wargame</a><p>공개된 문제와 종료된 대회의 학습 기록</p></li>
  <li><a href="{{ '/categories/bug-bounty/' | relative_url }}">Bug Bounty</a><p>승인된 scope 안에서의 활동과 공개 허용된 내용</p></li>
  <li><a href="{{ '/categories/tech-docs/' | relative_url }}">블로그 / 기술문서</a><p>개념 정리, 도구 사용법, 문서 번역·요약</p></li>
  <li><a href="{{ '/categories/papers-conferences/' | relative_url }}">논문 / 컨퍼런스</a><p>읽은 논문과 발표 정리</p></li>
  <li><a href="{{ '/categories/contests-certs/' | relative_url }}">공모전 / 자격증</a><p>참여 기록과 공부 과정</p></li>
</ul>

## 최근 글

<ul class="post-list">
{% for post in site.posts limit:10 %}
  <li>
    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%Y-%m-%d' }}</time>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </li>
{% endfor %}
</ul>
