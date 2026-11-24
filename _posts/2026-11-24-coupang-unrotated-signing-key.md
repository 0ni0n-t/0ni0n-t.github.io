---
title: "[사고 분석] 쿠팡 개인정보 유출 — 퇴사 뒤에도 무효화되지 않은 서명 키로 만든 전자 출입증"
category: tech-docs
sub: "IAM"
description: "2025년 11월 공개된 쿠팡 개인정보 유출 사고를 보안 초보자의 질문으로 따라가며, 퇴사자의 서명 키가 무효화되지 않은 일, 정부 조사 결과와 과징금, 기관마다 다른 피해 수치를 공식 발표와 표준 문서로 확인하고 서명 키 관리의 일반 원칙을 정리합니다."
date: 2026-11-24 20:20:00 +0900
---

과학기술정보통신부(이하 과기정통부) 조사 결과 정책뉴스([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415))와 개인정보보호위원회(이하 개인정보위)의 과징금 발표([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578))를 먼저 읽었고, 언론 보도에서만 찾은 내용은 2차라고 따로 표시했습니다. 쿠팡 공지 중 일부는 직접 열리지 않았는데, 어느 부분인지는 참고 절에 적었습니다.

## 뉴스에서 시작한 질문

2025년 11월 쿠팡 개인정보 유출이 알려지고, 2026년 2월 과기정통부가 조사 결과를, 6월 개인정보위가 과징금을 발표했습니다. 정부 발표에 따르면 인증 시스템을 개발했던 전 직원이 퇴사 뒤에도 무효화되지 않은 서명 키로 위조한 "전자 출입증"을 만들어, 정상 로그인 없이 이용자 계정에 접속했습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 보도자료에 쓰인 용어가 전자 출입증이어서 이 글도 그 말을 따릅니다.

이 글은 "회수되지 않은 것"을 다루는 3편 시리즈의 마지막입니다. [1편]({{ "/tech-docs/2026/11/24/barracuda-unretired-vendor-key/" | relative_url }})은 폐기되지 않은 키, [2편]({{ "/tech-docs/2026/11/24/qubole-trusted-cross-account-role/" | relative_url }})은 남아 있던 신뢰 정책을 봤습니다. 저는 보안 전문가가 아니고 AWS EKS 컨테이너 포렌식 랩을 만들어 돌려 본 초보자입니다([랩 글]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})).

### 기사를 읽고 든 질문

- 출입증을 위조할 수 있다는 게 무슨 뜻일까?
- 회사는 그 키를 왜 치우지 않았을까?
- 피해 건수는 왜 기사마다 다를까?


## 1. 전자 출입증과 서명 키가 뭐길래 키 하나로 남의 계정처럼 들어갈 수 있나요?

먼저 밝혀 둘 것이 있습니다. 쿠팡이 어떤 토큰 형식이나 어떤 클라우드를 썼는지는 제가 읽은 1차 출처에 없습니다. 이 절은 서명으로 검증하는 토큰 방식이 일반적으로 이런 구조라는 개념 설명이고, 쿠팡의 실제 구조라는 뜻이 아닙니다.

로그인에 성공하면 서버가 "이 사람은 인증됐다"는 내용이 담긴 토큰을 내주고, 이후 요청마다 그 토큰을 보여 주게 하는 방식이 있습니다. 서버가 자기가 만든 토큰이 맞는지 가려내려면 토큰에 서명을 붙입니다. 표준 문서 [RFC 7519(JSON Web Token)](https://www.rfc-editor.org/rfc/rfc7519)는 토큰에 담긴 주장(claim)을 서명이나 암호화로 보호하는 형식을 정의합니다. 이런 구조에서 서명 키를 가진 사람은 서버가 만든 것과 똑같이 검증을 통과하는 토큰을 만들 수 있습니다. 서버가 서명과 유효기간 같은 것을 확인하더라도, 발급 기록을 따로 대조하지 않으면 그 토큰이 정상 로그인 과정에서 발급됐는지는 알기 어려울 수 있다고 이해했습니다.

키를 바꾸는 일(회전)은 AWS KMS의 [키 회전 문서](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html)를 읽었습니다. 이 문서에서 자동 회전은 대칭 암호화 KMS 키에 대한 기능이고, 비대칭 키와 HMAC 키는 수동으로 회전한다고 설명합니다. 문서에는 회전이 이미 유출된 데이터 키의 영향을 줄여 주지는 않는다는 설명도 있는데, 이것은 데이터 키에 대한 말입니다. 서명 키라면 새 키를 쓰는 일과 옛 키를 검증에서 빼는 일이 따로일 수 있겠다는 생각은 제 해석이고 AWS 문서가 한 말이 아닙니다.

퇴사한 사람의 손에 그 키가 있었던 건 어떻게 된 일일까요.

## 2. 퇴사했는데 왜 키가 살아 있었나요? (근본 원인)

과기정통부 조사 결과([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415))와 개인정보위 발표([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578))에서 원인으로 꼽은 것을 읽었습니다.

정부는 공격자가 이용자 인증 관련 시스템을 개발한 직원이었고, 퇴사한 뒤에도 쿠팡이 서명 키를 즉시 무효화하지 않았다고 정리했습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 정상 발급 절차를 거치지 않은 전자 출입증, 곧 위조·변조한 출입증을 가려내 막는 검증 체계가 미흡했다는 지적과, 모의해킹으로 발견한 취약점의 개선이 충분하지 않았다는 지적도 같은 발표에 있습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 개인정보위는 여기에 인증 서명 키 관리와 접근통제가 소홀했다고 적었습니다 ([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578)).

공개된 자료에서 찾지 못한 것도 있습니다. 퇴사 시점은 2024년 11월이라는 보도가 있지만([KEIA](https://keia.org/the-peninsula/the-coupang-data-breach-a-timeline/), 2차) 정부 발표에서는 확인하지 못했습니다. 서명 키가 현직 개발자의 노트북에 있었다, 개발과 운영 환경이 분리되지 않았다, 퇴사자가 키 관리 시스템 접근을 유지했다는 내용은 일부 영문 보도([Biometric Update](https://www.biometricupdate.com/202602/south-korea-publishes-investigation-results-into-coupang-data-breach), [Korea Times](https://www.koreatimes.co.kr/business/companies/20260210/korean-govt-confirms-3367-mil-user-records-leaked-in-coupang-breach), 2차)에 있지만, 제가 읽은 정부 자료에서는 확인하지 못해 사실로 쓰지 않았습니다.

## 3. 쿠팡은 언제 알았고 무엇을 했나요? (대응)

날짜는 정부 발표를 기준으로 하고, 확인하지 못한 날짜는 그림에서 점선 상자로 구분했습니다. 아래 목록의 번호는 그림 번호와 같습니다.

![쿠팡 개인정보 유출 사고 타임라인]({{ '/assets/img/posts/coupang-incident-timeline.svg' | relative_url }})

1. 퇴사: 인증 시스템 개발자였던 직원이 퇴사했고 서명 키는 바로 무효화되지 않았습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 퇴사 시점이 2024년 11월이라는 것은 보도만 있습니다 ([KEIA](https://keia.org/the-peninsula/the-coupang-data-breach-a-timeline/), 2차, 미확인).
2. 공격 기간: 공격 시작일이 2025년 4월 14일이라는 보도가 있으나 ([Biometric Update](https://www.biometricupdate.com/202602/south-korea-publishes-investigation-results-into-coupang-data-breach), [KEIA](https://keia.org/the-peninsula/the-coupang-data-breach-a-timeline/), 2차) 정부 영문 발표 앞부분에서는 확인하지 못했습니다. 퇴사부터 인지까지 7개월쯤이라는 서술도 같은 이유로 사실로 쓰지 않았습니다.
3. 인지: 정부는 쿠팡이 2025년 11월 17일 16시에 침해를 알게 됐다고 정리했고, 초기 신고 규모는 약 4,536계정이었습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415), [M1](https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1221)). 쿠팡 공지는 인지일을 11월 18일로 적고 있어([C2](https://news.coupang.com/archives/58849/)) 두 날짜가 출처마다 다릅니다. 정부 영문 발표에는 하루 전인 11월 16일 고객 문의로 의심 메일이 접수되고 공격자의 첫 메일이 도착했다고 나옵니다. 알게 된 계기가 외부에서 온 연락이었던 것으로 보이고, 쿠팡이 스스로 탐지했다는 근거는 읽은 자료 어디에도 없었습니다.
4. KISA 신고: 11월 19일 21시 35분에 한국인터넷진흥원(KISA)에 신고해 인지 뒤 24시간을 넘겼습니다. 정부는 자료보전 명령이 내려진 뒤에도 웹과 앱 접속 기록이 삭제된 것을 22시 34분에 확인했다고 밝혔습니다. 22시 34분은 삭제가 확인된 시각이고 명령이 내려진 시각이 아닙니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)).
5. 공개: 쿠팡이 2025년 11월 29일 공지에서 약 3,370만 계정의 정보가 노출됐다고 알렸습니다 ([C2](https://news.coupang.com/archives/58849/)).6. 정부 결과: 과기정통부가 2026년 2월 10일 조사 결과를 발표했습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)).
7. 과징금: 개인정보위가 2026년 6월 10일 과징금을 의결했습니다 ([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578)).

정부 쪽 대응도 이어졌습니다. 과기정통부는 11월 30일 민관합동조사단을 꾸렸고([M1](https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1221)), 신고 지연에는 과태료를 부과할 예정이며(영문 발표는 최대 3천만 원), 자료보전 명령을 어긴 접속 기록 삭제는 수사를 의뢰했다고 합니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415), [M1](https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1221)). 쿠팡은 2025년 12월 25일 자체 조사 결과로 약 3,300만 계정에 접근했고 실제로 저장한 것은 약 3,000계정이며 제3자 전송은 없다고 밝혔습니다. 이것은 회사의 주장이고 독립적으로 검증된 내용은 아닙니다 ([C1](https://www.aboutcoupang.com/English/news/news-details/2025/update-on-coupang-korea-cybersecurity-incident)).

회사가 말한 3,000이라는 숫자와 정부의 3,367만이라는 숫자가 한 사건에 같이 있는 게 이상했습니다.

## 4. 숫자는 왜 이렇게 다른가요?

처음에는 3,000과 3,367만이 같은 대상을 센 숫자인 줄 알았습니다. 자료를 다시 보니 회사는 접근과 저장을 나누어 말했고, 정부는 수정 페이지에서의 유출을 발표했습니다.

- 4,536계정: 초기 신고 규모입니다 ([M1](https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1221)). 이후 정부는 수천만 건 규모로 판단했으니 처음 신고한 규모와 조사 뒤 규모가 크게 달랐습니다.
- 약 3,300만 계정과 약 3,000계정: 쿠팡이 2025년 12월 25일 밝힌 숫자로, 약 3,300만 계정에 접근했고 약 3,000계정의 정보를 저장했다는 주장입니다 ([C1](https://www.aboutcoupang.com/English/news/news-details/2025/update-on-coupang-korea-cybersecurity-incident)). 회사 주장입니다.
- 약 3,367만 건: 과기정통부가 "내 정보 수정 페이지"에서 이름과 이메일이 유출됐다고 발표한 수입니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 건 단위까지 적은 정확한 값은 원문에서 확인하지 못해 쓰지 않았습니다. 일부 영문 자료에 33.76 million으로 적힌 곳이 있다는 열람 결과가 있는데, 표기 오류일 수 있어 원문 대조가 필요합니다(확인하지 못함).
- 약 1.4억 회: 같은 정책뉴스에 배송지 목록 조회 횟수로 나옵니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)). 이 역시 더 정밀한 값은 확인하지 못했습니다.
- 약 3,755만 명: 개인정보위가 정리한 피해 규모입니다 ([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578)). 회원과 비회원으로 나눈 세부 수치는 보도로만 있어 옮기지 않았습니다.

두 기관의 숫자는 집계한 범위와 기준이 달라서 단순히 나란히 놓고 비교하기 어렵다고 읽었습니다. 어느 쪽이 더 정확한지 판단할 자료는 제게 없습니다.

회사가 말한 3,000계정을 정부가 참고만 했다는 보도([Korea Times](https://www.koreatimes.co.kr/business/companies/20260210/korean-govt-confirms-3367-mil-user-records-leaked-in-coupang-breach), 2차)가 있고, 조회와 유출을 어떻게 정의하느냐가 쟁점이라는 보도도 있습니다(mt.co.kr, 2차, 본문은 열어 보지 못함). 건물 출입번호는 정부가 약 5만 건 조회로, 쿠팡이 실제 2,609계정으로 본다는 보도도 보았지만 2차 출처라 확정하지 않았습니다.

## 5. 정부는 무엇을 지적했고 무엇을 요구했나요?

과기정통부는 재발방지 대책으로 비정상 발급 토큰을 탐지하고 차단하는 체계 도입, 모의해킹 취약점 조치, 서명 키 발급과 폐기 등의 관리 강화를 제시했습니다. 일정은 2026년 2월 이행계획 제출, 3~5월 이행, 6~7월 점검이고, 보완이 필요하면 시정조치 명령까지 이어집니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415)).

개인정보위는 2026년 6월 10일 전체회의에서 쿠팡에 과징금 6,246억 8,100만 원과 과태료 1,680만 원을 의결했고, 시정명령과 공표명령도 함께 의결했습니다. 시정명령에는 안전조치 강화, 비회원 정보주체에 대한 유출 통지, 개인정보 보호책임자(CPO)의 실질적 역할 보장이 들어 있고 3개월 안에 이행을 확인한다고 합니다 ([K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578)). 같은 발표에는 유출 통지·파기 의무 위반과 조사 방해도 지적됐습니다.

쿠팡이 2026년 10월 7일 과징금 취소소송을 냈다는 보도가 있습니다([YTN](https://www.ytn.co.kr/_ln/0103_202610082154544681), 2차). 법원 접수 자체는 확인하지 못했습니다. 소송이 진행 중이어서 결과나 쟁점에 대한 평가는 쓰지 않습니다.

## 6. 그래서 무엇이 모자랐나요? (미흡점)

앞에서 읽은 내용 중에는 위조한 전자 출입증을 가려내지 못한 점과 모의해킹 뒤 조치가 부족했던 점이 특히 남았습니다. 퇴사자의 서명 키를 무효화하지 않은 것, 인지 뒤 신고가 늦고 접속 기록이 지워진 것도 정부가 짚었습니다 ([K1](https://www.korea.kr/news/policyNewsView.do?newsId=148959415), [K2](https://www.korea.kr/news/policyNewsView.do?newsId=148966578)).

모의해킹 대목은 계속 마음에 걸렸습니다. 외부에서 일부러 약점을 찾아 준 결과가 있었는데도 조치가 부족했다는 지적을 읽고, 발견한 취약점이 실제로 고쳐졌는지 확인하는 과정이 왜 중요한지 생각했습니다. 어느 취약점이 이 사고와 닿아 있었는지는 자료에 없어서 연결하지는 못합니다.

탐지도 남는 질문입니다. 정부 영문 발표에는 고객 문의와 공격자의 메일이 나옵니다. 그 전에 쿠팡이 자체 경보를 받았는지는 찾지 못했고, 위조된 출입증이 쓰이는 동안 경보가 있었는지가 궁금합니다. 접속 기록이 지워진 일은 정부가 자료보전 명령 위반으로 수사를 의뢰한 사안이라, 이유는 제가 알 수 없어 적지 않겠습니다.

## 7. 내가 서명 키를 관리한다면 무엇을 해 둘까요?

이 절은 서명으로 검증하는 토큰 방식에 일반적으로 해당하는 이야기이고, 쿠팡의 구조와는 분리해서 읽어 주세요. 제 랩에서 해 본 것이 없고 명령도 적지 않았습니다. 환경마다 쓰는 도구가 달라서입니다.

쿠팡의 실제 설정은 모르지만, 제가 키를 맡는다면 먼저 서명 키가 어디에 있고 누가 접근할 수 있는지부터 목록으로 만들고 싶습니다. 그걸 모르면 퇴사자의 접근을 끊을 수도 없기 때문입니다. 이번 사고는 사람이 나갔는데 키가 남은 일이어서, 퇴사나 업무 변경 절차에 키 접근 회수가 들어 있었는지가 궁금했고 저라면 그 절차를 같이 찾아보겠습니다.

키를 바꾸는 일은 새 키를 쓰는 데서 끝나지 않고, 검증하는 쪽이 옛 키로 만든 토큰을 더는 통과시키지 않는 데까지 가야 의미가 있다고 이해했습니다. 이것은 앞에서 말한 제 해석입니다. 정상 발급한 토큰의 기록을 남겨 두었다가 검증할 때 대조하면 발급 기록이 없는 토큰을 경보로 올릴 수 있을 것 같습니다. 과기정통부가 요구한 "정상 발급 절차를 거치지 않은 출입증의 탐지·차단"이 이런 모습일지는 쿠팡의 구현을 몰라 단정하지 못합니다. 모의해킹이나 점검에서 나온 지적은 담당자와 기한을 정하고 닫혔는지 확인하는 것까지 봐야 한다고 생각했습니다.

## 되돌아보기

| 질문 | 찾은 답 | 모르는 것 |
|---|---|---|
| 서명 키가 왜 중요한가? | 서명 키가 있으면 서버가 만든 것처럼 검증을 통과하는 토큰을 만들 수 있는 구조가 일반적입니다 | 쿠팡의 실제 토큰 방식 |
| 키는 왜 살아 있었나? | 퇴사 뒤에도 서명 키를 즉시 무효화하지 않았다고 정부가 밝혔습니다 | 퇴사 시점, 키가 보관된 곳 |
| 언제 알고 무엇을 했나? | 정부는 11월 17일 인지, 쿠팡 공지는 11월 18일. 19일 신고로 24시간 초과, 명령 이후 접속 기록 삭제가 22시 34분에 확인됐습니다. 11월 29일 쿠팡이 약 3,370만 계정 노출을 공지했습니다 | 공격 시작일, 두 인지일이 다른 이유 |
| 숫자는 왜 다른가? | 접근과 저장, 건수와 사람 수 등 집계 범위와 기준이 달랐습니다 | 기관별 수치를 맞춰 보는 방법 |
| 서명 키를 맡는다면? | 키 목록, 퇴사 절차, 회전과 옛 키 제거, 발급 기록 대조를 정리했습니다 | 직접 해 본 결과 |

## 우리 랩의 토큰은 재시작하면 바뀌었는데, 이 키는 왜 그대로였을까요?

사고를 보다가 팀에서 한 [컨테이너 포렌식 프로젝트]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})의 ⑨ 재시작 단계가 생각났습니다. 파드를 지워 다시 띄우자 메모리에 있던 ServiceAccount 토큰은 새 토큰으로 바뀌었고, 재시작하지 않은 비교 파드의 토큰은 그대로였습니다. 제 랩에서는 파드를 다시 만든 뒤 새 토큰이 보였습니다. 왜 바뀌는지의 내부 동작까지는 확인하지 않았습니다.

그 글 3-8절에는 파드를 지운 직후 401 응답이 기록됐다는 대목이 있습니다. 옛 토큰이 거절된 흔적일 수도 있겠다고 기대했지만, 그 401이 제가 확인하려던 옛 토큰 때문에 나온 것인지는 당시 기록만으로 알 수 없었습니다. 그래서 랩에서 토큰이 바뀌는 것까지만 확인했고, 훔친 토큰이 쓸모없어진다고는 말할 수 없습니다.

랩에서 바뀐 것은 파드가 받은 토큰이고, 쿠팡에서 문제가 된 것은 토큰에 서명하는 키라서 둘을 같은 것으로 비교할 수는 없습니다. 그래도 언제 바꾸고 언제 무효화할지를 생각하게 됐습니다. 이 비교는 제 해석이고, 쿠팡이 키를 어떻게 운영했는지는 제가 모릅니다.

## 시리즈를 마치며

세 편에서 읽은 사고는 각각 다른 방식으로 남아 있던 것이 접근에 쓰였습니다. Barracuda에서는 일이 끝난 뒤에도 남은 외주 업체의 클라우드 키가, Qubole에서는 쓰지 않는 연동에 남은 신뢰 정책이, 쿠팡에서는 퇴사 뒤에도 무효화되지 않은 서명 키가 쓰였다고 각 출처가 전합니다. 키를 폐기하는 일, 신뢰 관계를 지우는 일, 서명 키를 무효화하는 일은 서로 다른 조치여서 하나로 묶지는 않겠습니다. 처음 어떻게 노출됐는지도 편마다 달랐습니다.

세 사건을 읽고 나니 일이 끝난 뒤에 키나 연동을 누가 지우는지가 궁금해졌습니다. 제 랩에 남은 키와 역할부터 확인해 보려고 합니다. 실제로 해 보면 이 글에 덧붙이겠습니다.

## 참고

1차 출처(정부 발표, 회사 공지)

- K1: [과기정통부 쿠팡 침해사고 조사 결과, 정책뉴스](https://www.korea.kr/news/policyNewsView.do?newsId=148959415), 2026-02-11 게시(발표 2026-02-10)
- K2: [개인정보위 쿠팡 과징금 처분](https://www.korea.kr/news/policyNewsView.do?newsId=148966578), 2026-06-16 게시(의결 06-10)
- M1: [과기정통부 영문 발표](https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1221), 2026-02-10. 본문 앞부분만 읽음
- C1: [Coupang, Update on Coupang Korea cybersecurity incident](https://www.aboutcoupang.com/English/news/news-details/2025/update-on-coupang-korea-cybersecurity-incident), 2025-12-25. 회사의 주장이며 독립 검증이 아닙니다
- C2: [쿠팡 공지](https://news.coupang.com/archives/58849/), 2025-11-29 게시

2차 출처(언론, 연구기관)

- KEIA: [The Coupang data breach, a timeline](https://keia.org/the-peninsula/the-coupang-data-breach-a-timeline/), 2026-02-22
- Korea Times: [Korean govt confirms 33.67 mil. user records leaked](https://www.koreatimes.co.kr/business/companies/20260210/korean-govt-confirms-3367-mil-user-records-leaked-in-coupang-breach), 2026-02-10
- Biometric Update: [South Korea publishes investigation results](https://www.biometricupdate.com/202602/south-korea-publishes-investigation-results-into-coupang-data-breach), 2026-02-13
- YTN: [과징금 취소소송 보도](https://www.ytn.co.kr/_ln/0103_202610082154544681), 2026-10-08

개념 문서

- D1: [RFC 7519, JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519), 2015-05. 개념 설명용이며 쿠팡이 이 형식을 썼다는 근거는 아닙니다.
- D2: [AWS KMS, Rotate keys](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html). 개념 설명용이며 쿠팡이 AWS를 썼다는 근거는 아닙니다.

사고 관련 기록은 2026-11-24에 열람한 상태이고, 이후 공지와 소송 경과가 바뀔 수 있습니다.
