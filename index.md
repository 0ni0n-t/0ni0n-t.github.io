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

## 최근 글

{% if site.posts.size > 0 %}
<ul class="post-list">
{% for post in site.posts limit:10 %}
  <li>
    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%Y-%m-%d' }}</time>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </li>
{% endfor %}
</ul>
{% else %}
<p class="muted">아직 글이 없습니다.</p>
{% endif %}
