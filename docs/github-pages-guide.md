# GitHub Pages 사용 가이드 — 0ni0n__T 블로그용

이 문서는 저장소 안내용이다. `_config.yml` 의 `exclude` 에 `docs/` 가 있어 사이트에는 포함되지 않는다.

> **출처 확인 상태 (2026-10-28)**
> 이 문서를 만든 실행에서는 웹 문서를 직접 열 수 없었다(웹 읽기 권한 미승인).
> 각 설명 옆에 해당 GitHub 공식 문서 링크를 달았지만, 원문과 대조하지 못했으므로 모든 사실 항목은 **(미확인)** 이다.
> 메뉴 이름이나 화면 구성은 바뀔 수 있으니 링크를 열어 확인한 뒤 따라 하고, 확인한 항목은 "(미확인)"을 지운다.
> 저장소 생성, push, Pages 활성화는 모두 **사용자가 직접 할 단계**다. 이 저장소의 작업에서는 실행하지 않았다.

---

## 1. GitHub Pages 란

- GitHub 저장소의 HTML·CSS·JavaScript 파일을 받아 정적 웹사이트로 게시하는 호스팅 서비스다. 필요하면 Jekyll 같은 빌드 과정을 거친다. (미확인) — [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- Jekyll 을 기본 지원한다. 이 블로그가 Jekyll 로 만들어진 이유다. (미확인) — [About GitHub Pages and Jekyll](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll)
- 사용 가능한 요금제·저장소 공개 여부 조건, 용량·대역폭 같은 사용 제한이 있다. 수치는 문서에서 직접 확인한다. (미확인) — [What is GitHub Pages? (제한 사항 절)](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 2. 사용자 사이트 vs 프로젝트 사이트

| 구분 | 저장소 이름 | 기본 주소 | 이 블로그의 `baseurl` |
|---|---|---|---|
| 사용자(또는 조직) 사이트 | `<username>.github.io` | `https://<username>.github.io` | `""` |
| 프로젝트 사이트 | 아무 이름 (예: `blog`) | `https://<username>.github.io/blog` | `"/blog"` |

- 사용자 사이트는 저장소 이름을 `<username>.github.io` 로 만들어야 하며, 계정당 하나다. (미확인) — [What is GitHub Pages? (Types of GitHub Pages sites)](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- 프로젝트 사이트는 저장소마다 만들 수 있고 주소에 저장소 이름이 붙는다. (미확인) — 같은 문서
- 사이트 만들기 전체 절차 — [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) (미확인)

**추천**: 개인 블로그는 사용자 사이트(`<username>.github.io`)가 주소가 짧고 `baseurl` 이 비어 있어 설정이 단순하다.

## 3. 올리고 배포 소스 고르기 (사용자가 직접 할 단계)

### 3-1. 이 저장소에서의 주의점

`blog/` 는 개인 운영 저장소(ai_manger)의 **하위 폴더**다. 이 저장소에는 블로그와 무관한 개인 데이터가 많으므로, 이 저장소를 그대로 공개해 Pages 를 켜는 것은 권하지 않는다.

- 브랜치 배포를 쓸 때 게시 폴더는 브랜치의 루트(`/`) 또는 `/docs` 중에서 고른다고 안내되어 있다. 즉 `/blog` 같은 임의 하위 폴더는 브랜치 배포로 바로 고를 수 없다. (미확인) — [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

선택지:

1. **(권장) 별도 저장소 루트로 복사**: 새 저장소 `<username>.github.io` 를 만들고, `blog/` **안의 내용**(`_config.yml`, `_layouts/` 등)을 그 저장소의 루트에 복사해 push 한다.
2. **GitHub Actions 사용**: 별도 저장소에서 사용자 정의 워크플로로 원하는 폴더를 빌드해 배포할 수도 있다. (미확인) — [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
3. 이 운영 저장소 자체를 공개하는 방식은 개인 데이터 노출 위험이 있어 쓰지 않는다.

### 3-2. 단계 (선택지 1 기준)

```bash
# (1) GitHub 웹에서 새 저장소 <username>.github.io 생성 (사용자 직접)
# (2) 로컬에서 blog/ 내용을 새 폴더로 복사한 뒤
cd <복사한-폴더>
git init
git add .
git commit -m "init blog"
git branch -M main
git remote add origin https://github.com/0ni0n-t/0ni0n-t.github.io.git
git push -u origin main
```

(3) 저장소 **Settings → Pages** 로 이동한다.
(4) **Build and deployment → Source** 에서 고른다. (미확인) — [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
   - **Deploy from a branch**: 브랜치 `main`, 폴더 `/ (root)` 선택 후 Save
   - **GitHub Actions**: 워크플로로 빌드·배포 (선택지 2)
(5) 잠시 후 같은 화면에 표시되는 사이트 주소로 접속해 확인한다.

## 4. `_config.yml` 계정 설정

2026-10-28 에 계정명 `0ni0n-t`(사용자 사이트) 기준으로 채웠다. 표시 이름 `0ni0n__T` 는 GitHub 계정명에 밑줄을 쓸 수 없어(미확인 — 가입 화면에서 확인) 계정명과 다르게 두었다. 이메일은 공개하지 않기로 해 `contact_email` 과 footer.html·about.md 의 Contact 줄을 지웠다.

```yaml
url: "https://0ni0n-t.github.io"
baseurl: ""                 # 사용자 사이트: ""  /  프로젝트 사이트로 바꾸면 "/저장소이름"
github_username: "0ni0n-t"  # 푸터·About 의 GitHub 링크
```

계정명을 바꾸게 되면 `url` 과 `github_username` 을 함께 고친다.

- 모든 내부 링크는 `{{ '/path/' | relative_url }}` 로 작성되어 있어 `baseurl` 만 맞게 바꾸면 경로가 따라 바뀐다.
- `url`/`baseurl` 의 의미는 Jekyll 설정 문서와 GitHub 의 Jekyll 안내를 참고한다. (미확인) — [About GitHub Pages and Jekyll](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll)

## 5. 로컬에서 미리보기

- 절차 출처 (미확인) — [Testing your GitHub Pages site locally with Jekyll](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/testing-your-github-pages-site-locally-with-jekyll)

1. Ruby 를 설치한다(Windows 는 RubyInstaller 의 Devkit 포함 버전이 일반적). Jekyll 설치 안내는 Jekyll 공식 문서를 따른다.
2. Bundler 설치: `gem install bundler`
3. 블로그 폴더에서 의존성 설치:
   ```bash
   cd blog
   bundle install
   ```
4. 미리보기 서버 실행:
   ```bash
   bundle exec jekyll serve
   ```
5. 브라우저에서 `http://localhost:4000` 으로 접속한다(`baseurl` 을 넣었다면 `http://localhost:4000/blog`).
6. 빌드 산출물 `_site/`, `.jekyll-cache/` 는 `blog/.gitignore` 에 들어 있어 커밋되지 않는다.

`Gemfile` 은 `github-pages` gem 을 써서 GitHub Pages 빌드 환경과 비슷하게 맞춘다. (미확인) — 위 문서

## 6. 이 블로그에 새 글 추가

- Jekyll 글 추가 방법 출처 (미확인) — [Adding content to your GitHub Pages site using Jekyll](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/adding-content-to-your-github-pages-site-using-jekyll)

1. `_posts/` 에 `YYYY-MM-DD-영문-slug.md` 형식으로 파일을 만든다. 예: `_posts/2026-11-02-linux-permissions.md`
2. 맨 위에 front matter 를 넣는다.
   ```markdown
   ---
   title: "리눅스 파일 권한 정리"
   category: tech-docs
   ---
   ```
3. `category` 값은 아래 중 하나를 쓴다. 이 값이 카테고리 페이지 글 목록에 쓰인다.

   | category 값 | 메뉴 이름 |
   |---|---|
   | `dev` | 개발 |
   | `ctf-wargame` | CTF/Wargame |
   | `bug-bounty` | Bug Bounty |
   | `tech-docs` | 블로그/기술문서 |
   | `papers-conferences` | 논문/컨퍼런스 |
   | `contests-certs` | 공모전/자격증 |

4. 처음 만들 때 넣었던 카테고리별 [안내]·템플릿 글은 2026-10-28 에 지웠다. 필요하면 게시 저장소 첫 commit(4c475fd)의 `_posts/` 에서 꺼내 볼 수 있다.
5. 미래 날짜의 글은 기본 설정에서 빌드되지 않으므로 날짜를 오늘 이하로 둔다.

**새 카테고리 추가**

1. `categories/새slug.md` 를 만든다(`layout: category`, `category_slug: 새slug`, `permalink: /categories/새slug/`).
2. `_config.yml` 의 `category_names` 에 `새slug: "표시 이름"` 을 추가한다. 왼쪽 사이드바가 이 목록을 순서대로 그리고 글 수를 붙인다.
3. 상단 메뉴(`_data/navigation.yml`)에는 Roadmap·About 같은 페이지만 둔다. 사이드바는 헤더 왼쪽 버튼으로 접고 편다(데스크톱은 상태를 기억, 모바일은 서랍).

## 7. 커스텀 도메인과 HTTPS 개요

- 직접 산 도메인을 Pages 사이트에 연결할 수 있다. Settings → Pages 의 Custom domain 에 입력하고, 도메인 업체(DNS)에서 레코드를 설정한다. (미확인) — [About custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages), [Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- 다른 사람이 도메인을 가로채지 못하도록 도메인 소유권 확인(verify) 기능이 있다. (미확인) — [Verifying your custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- HTTPS 는 `github.io` 주소와 설정된 커스텀 도메인에서 쓸 수 있고, Settings → Pages 의 **Enforce HTTPS** 로 강제할 수 있다. 커스텀 도메인은 인증서 발급에 시간이 걸릴 수 있다. (미확인) — [Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- 커스텀 도메인을 쓰면 `_config.yml` 의 `url` 을 그 도메인으로, `baseurl` 을 `""` 로 바꾼다.

## 8. 자주 겪는 문제

1. **404 가 뜬다**
   - 저장소 이름(`<username>.github.io`), 배포 브랜치·폴더 설정, 루트에 `index.md`/`index.html` 이 있는지 확인한다. (미확인) — [Troubleshooting 404 errors](https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites)
   - `blog/` 폴더째 올려서 사이트 루트가 `blog/` 아래에 있는 경우도 404 원인이 된다. 3-1 의 선택지 1처럼 **내용**을 루트에 둔다.
2. **CSS 가 깨지고 글자만 보인다 / 링크가 엉뚱한 곳으로 간다**
   - 대부분 `baseurl` 불일치다. 프로젝트 사이트면 `baseurl: "/저장소이름"`, 사용자 사이트면 `""`. 새 링크를 쓸 때도 `relative_url` 필터를 쓴다.
   - `_config.yml` 은 로컬 `jekyll serve` 실행 중에는 다시 읽히지 않으므로, 바꾼 뒤 서버를 재시작한다.
3. **빌드 실패**
   - 저장소의 **Actions** 탭에서 Pages 빌드 실행 기록과 오류 메시지를 확인한다. Liquid 문법 오류, 잘못된 front matter(YAML)가 흔하다. (미확인) — [About Jekyll build errors](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-jekyll-build-errors-for-github-pages-sites), [Troubleshooting Jekyll build errors](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/troubleshooting-jekyll-build-errors-for-github-pages-sites)
   - push 전에 로컬에서 `bundle exec jekyll build` 로 먼저 확인한다.
4. **수정했는데 반영이 안 된다**
   - push 후 게시까지 시간이 걸릴 수 있다. Actions 탭에서 배포가 끝났는지 확인하고, 브라우저 캐시를 비우고 새로고침한다. (미확인) — [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
5. **새 글이 목록에 없다**
   - 파일명 형식(`YYYY-MM-DD-slug.md`), front matter 의 `---` 두 줄, 날짜가 미래인지, `category` 철자를 확인한다.

## 9. 게시 체크리스트 (사용자가 직접)

1. GitHub 계정 `0ni0n-t` 가입(사용 가능 여부 확인), 저장소 이름 `0ni0n-t.github.io`
2. 실명 공개 여부 — 2026-10-28 닉네임(0ni0n__T)만 쓰기로 결정, 실명 제거함
3. 새 저장소 생성 → `blog/` 내용을 루트로 복사 → push
4. Settings → Pages 에서 배포 소스 선택
5. `_config.yml` 의 `url`·`github_username` 이 실제 계정과 같은지 확인(현재 `0ni0n-t`), 다르면 고쳐 다시 push
6. 사이트 주소에서 메뉴 9개(홈, 카테고리 6개, Roadmap, About)와 CSS 가 정상인지 확인
7. `roadmap.md` 와 이 문서의 "(미확인)" 항목을 공식 문서로 확인해 갱신
