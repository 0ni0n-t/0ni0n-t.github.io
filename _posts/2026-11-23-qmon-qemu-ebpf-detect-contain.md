---
title: "[개발] qmon — VM escape 뒤 QEMU의 이상 행동을 eBPF로 찾고 막는 도구 만들기"
category: dev
sub: "보안 도구"
description: "가상 머신을 탈출한 공격자가 호스트의 QEMU 프로세스로 무엇을 하는지 eBPF로 지켜보고, 위험한 행동은 BPF-LSM으로 막는 도구를 만든 과정을 실제 코드와 함께 정리합니다."
---

## 1. 이 개발을 하게 된 계기

클라우드에서는 여러 사람의 가상 머신(VM)이 한 대의 물리 서버를 나눠 씁니다. 리눅스에서는 VM 하나가 호스트에서 QEMU라는 프로세스 하나로 돌아갑니다.
그런데 QEMU의 취약점을 이용하면 VM 안의 공격자가 VM 밖으로 빠져나올 수 있습니다. 이것을 VM escape라고 합니다. 빠져나온 공격자는 호스트에서 QEMU 프로세스의 권한으로 움직입니다.

논문 주제를 VM escape 탐지로 정하면서, 실험에 쓸 도구가 먼저 필요해졌습니다. 그래서 동아리 프로젝트로 직접 도구를 만들기로 했습니다. 이름은 qmon(QEMU monitor)입니다.

## 2. 시작하기 전 처음 질문

| 질문 | 시작 전 내 생각 |
|---|---|
| 탈출한 공격자는 QEMU 프로세스로 무엇을 할까? | 다른 VM의 디스크를 열거나, 호스트의 민감한 파일을 읽거나, 셸을 띄우거나, 밖으로 연결할 것 같다 |
| 평소의 QEMU는 어떤 행동을 할까? | VM을 돌리는 일만 하니까 행동이 단순할 것 같다 |
| 호스트에서 eBPF로 이 행동을 볼 수 있을까? | 시스템 콜을 보면 될 것 같다 |
| Falco, Tetragon 같은 기존 도구와 무엇이 다를까? | 기존 도구는 정해진 규칙으로 보고, 나는 평소 행동을 배워서 보면 다를 것 같다 |
| 찾기만 하지 않고 막을 수도 있을까? | BPF-LSM을 쓰면 커널에서 바로 거절할 수 있을 것 같다 |

## 3. 어떻게 만들었고 어떤 결과가 나왔나

### 3-1. 전체 구조

qmon은 명령 하나에 하위 명령 여러 개가 붙은 Go 프로그램입니다. 각 하위 명령이 하나의 단계를 맡습니다.

```text
qmon collect                         호스트 eBPF로 QEMU 이벤트 수집 → JSONL
qmon learn  <events.jsonl> <out.json>     정상 이벤트로 기준선 학습
qmon detect [--contain] <profile.json> <events.jsonl>
                                     기준선에서 벗어난 행동을 경보로 출력
qmon guard  [--vm <name>] [--enforce] [--auto-contain <n>]
                                     BPF-LSM: 위험 행동 관측(audit) / 봉쇄(enforce)
```

흐름은 이렇습니다.

1. collect: 커널의 eBPF 프로그램이 QEMU의 시스템 콜 중 감시 대상 4가지(openat, connect, execve, mprotect)만 골라 한 줄씩 JSON으로 남깁니다.
2. learn: 정상 상태에서 모은 기록으로, QEMU 스레드 역할마다 평소에 하는 행동 목록을 만듭니다.
3. detect: 새 기록을 그 목록과 비교해, 목록에 없는 행동을 경보로 냅니다.
4. guard: 같은 4가지 행동을 BPF-LSM 훅에서 다시 보고, 봉쇄 대상이 된 QEMU의 위험 행동은 커널에서 거절합니다.

```text
qemu-monitor/
├── bpf/collector.bpf.c        커널에서 시스템 콜을 모으는 eBPF 프로그램
├── bpf/guard.bpf.c            BPF-LSM 봉쇄 프로그램
├── internal/collector/        eBPF 이벤트를 읽어 스레드 역할을 붙이는 Go 코드
├── internal/profile/          기준선 학습과 탐지
├── internal/guard/            guard 프로그램을 올리고 결과를 읽는 Go 코드
├── cmd/qmon/main.go           하위 명령 진입점
├── inject/inject.c            평가용 행동 주입기 (LD_PRELOAD)
└── compare/harness/           Falco·Tetragon 비교 실험 스크립트
```

### 3-2. 먼저 관찰했습니다

처음부터 탐지기를 만들지 않고, 정상 QEMU가 어떤 시스템 콜을 부르는지 먼저 관찰했습니다. VM을 부팅할 때, 디스크와 네트워크에 부하를 줄 때, 장치를 붙였다 뗄 때를 나눠서 봤습니다.
QEMU는 스레드마다 하는 일이 다릅니다. vCPU를 돌리는 스레드, 입출력을 맡는 스레드, 메인 스레드가 따로 있습니다. 그래서 스레드 역할을 나눠서 보기로 했습니다.

### 3-3. 수집기: 커널에서 QEMU의 시스템 콜만 골라내기

`bpf/collector.bpf.c`는 커널 안에서 돌아가는 eBPF 프로그램입니다. 모든 시스템 콜이 지나가는 `raw_syscalls:sys_enter` 지점에 붙어 시스템 콜 번호로 필요한 것만 골라냅니다. execve의 반환값(성공했는지, 거절됐는지)은 `raw_syscalls:sys_exit`에서 따로 모읍니다.

```c
SEC("tracepoint/raw_syscalls/sys_enter")
int tp_sys_enter(struct trace_event_raw_sys_enter *ctx)
{
	long id = ctx->id;
	if (id != SYS_openat && id != SYS_connect && id != SYS_execve && id != SYS_mprotect)
		return 0;              // 감시 대상 4가지가 아니면 바로 끝낸다
	if (!is_qemu())
		return 0;              // QEMU가 부른 것이 아니면 버린다

	if (id == SYS_mprotect) {
		__u32 prot = (__u32)ctx->args[2];
		if (!(prot & PROT_EXEC))
			return 0;          // 실행 권한을 주는 mprotect만 남긴다
		...
	}
	if (id == SYS_openat) {
		struct event *e = new_event(KIND_OPENAT);
		if (!e) return 0;           // 링 버퍼가 꽉 차면 이 이벤트는 버린다
		bpf_probe_read_user_str(&e->str, sizeof(e->str), (const void *)ctx->args[1]);
		bpf_ringbuf_submit(e, 0);   // 연 파일 경로를 링 버퍼로 보낸다
		...
```

이 코드가 하는 일은 세 가지입니다.

- 시스템 콜 번호로 openat(파일 열기), connect(네트워크 연결), execve(프로그램 실행), mprotect(메모리 권한 바꾸기)만 남깁니다.
- `is_qemu()`로 QEMU 프로세스가 부른 것만 남깁니다. 아래처럼 스레드 그룹 대표의 이름이 `qemu-system`으로 시작하는지 봅니다. QEMU가 fork로 만든 자식이 프로그램을 실행하는 경우도 놓치지 않도록, 부모의 이름도 같이 봅니다.
- 파일 경로, 연결 주소, 메모리 권한 같은 인자를 읽어 링 버퍼로 사용자 공간에 넘깁니다.

```c
static __always_inline int is_qemu(void)
{
	struct task_struct *t = (struct task_struct *)bpf_get_current_task();
	if (leader_is_qemu(BPF_CORE_READ(t, group_leader)))
		return 1;                                                   // QEMU 본체와 그 스레드
	return leader_is_qemu(BPF_CORE_READ(t, real_parent, group_leader)); // QEMU가 만든 자식
}
```

처음에는 `sys_enter_openat`, `sys_enter_execve`처럼 시스템 콜마다 따로 붙였습니다. 그런데 openat과 execve가 가끔 빠졌습니다. strace로 같은 시점을 같이 보니 시스템 콜은 실제로 일어났는데 수집기만 놓친 것이었습니다. 그래서 위처럼 공통 지점에 붙고 번호로 나누는 방식으로 다시 짰고, 그 뒤로는 5가지 행동이 모두 안정적으로 잡혔습니다.

Go 쪽(`internal/collector/collector.go`)은 이벤트를 받아 스레드 이름으로 역할을 붙입니다.

```go
func classify(comm string, tid, pid uint32) string {
	if tid == pid {
		return "main"           // 프로세스 대표 스레드
	}
	switch {
	case strings.HasPrefix(comm, "CPU "):
		return "vcpu"           // "CPU 0/KVM" 같은 vCPU 스레드
	case strings.HasPrefix(comm, "IO "):
		return "iothread"
	case comm == "vnc_worker":
		return "other"
	case comm == "worker":
		return "worker"
	...
```

`vnc_worker` 스레드가 `worker`로 잘못 분류된 적이 있어서, 이름 일부가 아니라 정확히 같을 때만 `worker`로 보도록 고쳤습니다.

### 3-4. 학습기와 탐지기: 평소 행동 목록과 비교하기

`internal/profile/profile.go`는 이벤트 하나를 짧은 문자열(서명)로 바꿉니다. 경로나 주소를 그대로 비교하면 매번 달라서 비교가 안 되기 때문에, 의미 있는 종류로 묶습니다.

```go
func Signature(e Event) string {
	switch e.Ev {
	case "openat":
		return "openat:" + classifyPath(e.Path, e.VM, e.Disk)   // 예: openat:host-sensitive
	case "connect":
		return "connect:" + classifyAddr(e.Addr)                // 예: connect:external
	case "execve_try":
		return "execve:" + classifyPath(e.Path, e.VM, e.Disk)   // 정상 QEMU는 프로그램을 실행하지 않는다
	case "mprotect":
		prot := protBits(e.Prot)
		if prot&protWrite != 0 && prot&protExec != 0 {
			return "mprotect-wx"   // 쓰기와 실행을 동시에: 코드 주입의 강한 신호
		}
		return "mprotect-x"        // 실행만: JIT를 쓰는 QEMU는 정상적으로도 한다
	}
	...
```

경로는 `classifyPath`가 종류로 나눕니다. `/etc/shadow`, `/etc/ssh/`, `/root/` 같은 곳은 host-sensitive, `/var/lib/libvirt/images/` 아래에서 자기 VM 디스크가 아니면 other-vm-disk, 라이브러리 경로는 qemu-share가 됩니다. 비교하기 전에 절대 경로는 `path.Clean`으로 정리합니다. 처음에는 이 정리가 없어서 `/etc/../etc/shadow` 같은 경로로 검사를 피할 수 있었습니다. 주소는 `classifyAddr`가 루프백, 사설망, 외부로 나눕니다.

학습과 탐지는 집합 비교입니다.

```go
// Learn: 정상 기록에서 (역할|단계)마다 나온 서명을 모은다
sig := Signature(e)
if sig == "" {
	continue                   // 신호가 아닌 이벤트(정상적인 QEMU 시작 exec 등)는 건너뛴다
}
k := e.Role + "|" + e.Phase
if p.Roles[k] == nil {
	p.Roles[k] = map[string]bool{}
}
p.Roles[k][sig] = true

// Detect: 그 역할의 목록에 없는 서명이면 이유를 붙여 경보를 낸다
sig := Signature(e)
if sig == "" {
	return nil, false
}
if set := p.Roles[key(e)]; set != nil && set[sig] {
	return nil, false          // 평소 하던 행동
}
reason := fmt.Sprintf("%s 역할의 %s 단계 기준선에 서명 '%s' 없음", e.Role, e.Phase, sig)
```

예를 들어 vCPU 스레드가 평소에 `openat:qemu-share`만 했다면, 같은 스레드에서 `openat:host-sensitive`가 나오는 순간 경보가 납니다. 경보에는 어느 역할, 어느 단계의 목록에 무엇이 없었는지가 같이 적혀서, 왜 울렸는지 바로 알 수 있습니다.

mprotect 라벨은 처음에 잘못 만들었습니다. 실행 권한만 있어도 모두 `mprotect-wx`로 붙였는데, 이러면 JIT를 쓰는 QEMU에서 정상 동작까지 공격처럼 보입니다. 쓰기와 실행이 동시에 있을 때만 `mprotect-wx`로 고쳤고, 별도의 시험 프로그램 `escape_sim`도 진짜 W^X 위반(권한 0x7)을 요청하도록 고쳤습니다.

### 3-5. 주입기: 탈출 뒤 행동을 안전하게 흉내 내기

진짜 VM escape 익스플로잇 없이 평가하려고, QEMU에 `LD_PRELOAD`로 붙는 작은 라이브러리(`inject/inject.c`)를 만들었습니다. 신호를 받으면 QEMU 안에서 5가지 행동을 차례로 합니다.

```c
// 사용: LD_PRELOAD=./libinject.so <대상>
// INJECT_ACTIONS: shell_exec, other_vm_disk, host_sensitive, connect, exec_mem
#define OTHER_VM_DISK "/var/lib/libvirt/images/inject-dummy-other-vm.qcow2"
#define SENSITIVE     "/etc/shadow"
#define DUMMY_IP      "203.0.113.9"   /* 문서 예시용 대역(TEST-NET-3)의 주소 */
```

- 주입기의 `exec_mem`은 실행 권한만 요청합니다.
- 행동마다 언제 했는지를 정답지 파일에 따로 적습니다. 나중에 탐지 결과와 시각을 맞춰 채점합니다.
- 행동을 하는 스레드 이름을 `CPU 1/KVM`처럼 바꿀 수 있어서, vCPU 스레드가 탈취된 상황을 흉내 낼 수 있습니다.
- 처음에는 SIGUSR1으로 깨웠는데, 실제 QEMU가 이 신호를 이미 쓰고 있어서 동작하지 않았습니다. 그래서 실시간 신호(SIGRTMIN+4)로 바꿨습니다.

### 3-6. 봉쇄기: BPF-LSM으로 커널에서 거절하기

`bpf/guard.bpf.c`는 LSM 훅 4개에 붙습니다. LSM 훅은 커널이 파일 열기나 연결을 허락하기 직전에 부르는 검사 지점이라, 여기서 `-EPERM`을 돌려주면 그 동작이 거절됩니다.

| LSM 훅 | 막는 행동 | 위험으로 보는 조건 |
|---|---|---|
| file_open | 호스트 민감 파일 열기 | `/etc/shadow`, `/etc/ssh/`, `/root/` 등으로 시작 |
| socket_connect | 외부 연결 | 루프백, 사설망, 링크로컬이 아닌 IPv4 |
| bprm_check_security | 프로그램 실행 | QEMU나 그 자식의 실행은 항상 위험 |
| file_mprotect | W^X 메모리 | 쓰기와 실행을 동시에 요청 |

연결 훅을 예로 들면 이렇습니다.

```c
SEC("lsm/socket_connect")
int BPF_PROG(qg_socket_connect, struct socket *sock, struct sockaddr *address, int addrlen, int ret)
{
	__u32 qt = qemu_instance_tgid();      // 어느 QEMU(VM) 소속인지
	if (!qt || !in_scope(qt))
		return ret;                       // QEMU가 아니거나 감시 대상 VM이 아니면 그대로 통과
	...
	int risk  = is_external(sin.sin_addr.s_addr);   // 외부 주소인가
	int block = decide_block(risk, qt);             // 봉쇄할 것인가
	...                                             // 결과를 기록으로 남기고
	return block ? -EPERM : ret;                    // 봉쇄면 거절, 아니면 원래 결과 그대로
}
```

`decide_block`이 핵심 판단입니다.

```c
static __always_inline int decide_block(int risk, __u32 qt)
{
	if (!risk)
		return 0;
	note_risk(qt);                  // 이 QEMU의 위험 행동 횟수를 하나 올린다
	struct cfg *c = get_cfg();
	if (!c || !c->enforce)
		return 0;                   // audit 모드면 기록만 하고 막지 않는다
	return ancestor_contained();    // 봉쇄 대상 QEMU의 프로세스 트리 안이면 막는다
}
```

- audit 모드(`--enforce` 없음): 아무것도 막지 않고, 막았을지만 기록합니다. 먼저 이 모드로 정상 QEMU가 영향을 받지 않는지 확인했습니다.
- enforce 모드: 봉쇄 대상 QEMU의 위험 행동만 거절합니다. 다른 VM은 영향을 받지 않습니다.
- `--auto-contain N`: `note_risk`가 위험 행동을 세다가 N번이 되면 그 QEMU를 봉쇄 대상 맵에 올립니다. 사용자 공간을 기다리지 않고 커널 안에서 바로 탐지에서 봉쇄로 넘어갑니다.

다른 VM 디스크 열기는 이번 봉쇄 대상에서 뺐습니다. 그 디스크가 자기 것인지 남의 것인지는 libvirt에 물어봐야 알 수 있는데, 커널 안에서는 그 정보가 없기 때문입니다. 이 행동은 audit 기록만 남깁니다.

`ancestor_contained`는 마지막에 고친 부분입니다. 봉쇄한 QEMU가 fork로 자식을 만들고 그 자식이 셸을 실행하면, 처음에는 자식이 별개의 프로세스로 보여서 가끔 막히지 않았습니다. 봉쇄 도구가 가끔만 막는 것은 쓸 수 없습니다. 그래서 지금 프로세스부터 부모를 최대 8단계까지 따라 올라가며, 봉쇄된 QEMU가 조상 중에 있으면 막도록 바꿨습니다.

```c
static __always_inline int ancestor_contained(void)
{
	struct task_struct *cur = (struct task_struct *)bpf_get_current_task();
#pragma unroll
	for (int i = 0; i < 8; i++) {               // eBPF 검증기를 통과하려고 횟수를 고정
		if (!cur)
			break;
		__u32 tg = BPF_CORE_READ(cur, tgid);
		if (bpf_map_lookup_elem(&contain_targets, &tg))
			return 1;                           // 조상 중에 봉쇄된 QEMU가 있다
		cur = BPF_CORE_READ(cur, real_parent);
	}
	return 0;
}
```

조상 탐색은 위험 행동의 차단 여부를 판단할 때만 합니다. 훅에 들어가 QEMU인지, 위험한지 판단하는 비용은 평소에도 듭니다. 고친 뒤 같은 시험을 3번 연속 돌려 매번 차단되는 것을 확인했습니다.

### 3-7. 결과

기존 도구와 비교했습니다. 같은 실험용 타깃과 정상 입력으로 qmon, Falco, Tetragon을 5번씩 돌렸습니다. 정상 입력은 `--version`, KVM 일시정지, TCG의 세 경우이고, 실제 VM에서 vCPU·디스크·네트워크 작업을 돌리며 잰 오탐은 아닙니다.

| 도구 | 탐지율 (5회 평균) | 정상 입력 3가지에서 나온 오탐 |
|---|---|---|
| qmon | 100% | 0 / 0 / 1 |
| Falco (비교용 규칙) | 100% | 234 / 234 / 235 |
| Tetragon (비교용 규칙) | 100% | 49 / 49 / 50 |

탐지율은 셋 다 100%라 차이가 없었습니다. 흉내 낸 행동이 워낙 뚜렷했기 때문입니다.
차이는 오탐에서 났습니다. Falco와 Tetragon 비교 규칙은 거친 경로 기준으로 판단해서, 실험 환경의 비표준 경로에 있는 라이브러리 파일을 열 때마다 경보를 냈습니다. qmon은 정상 기준선을 배워 두었기 때문에 거의 울리지 않았습니다. 다만 비교 규칙은 경로 기준의 거친 규칙이라, 규칙을 다듬으면 차이가 줄 수 있습니다. qmon에서 나온 오탐 1건은 TCG의 JIT가 만든 W^X mprotect였습니다.

실제로 돌아가는 VM의 QEMU 한 대를 60초 동안 지켜봤을 때, 감시하는 위험 행동은 0건이었습니다. 다만 쉬고 있는 VM 한 대를 짧게 본 결과라, 이것만으로 여러 정상 작업에서의 오탐률을 결론 내릴 수는 없습니다.

실제 VM에서 해 보니 예상과 달랐습니다. 실험용 가짜 QEMU에서는 수집기가 5가지를 모두 잡았는데, 실제 libvirt로 띄운 VM에서는 4가지만 잡혔습니다. 이 환경에서는 libvirt가 기본으로 켜 두는 seccomp가 QEMU의 프로그램 실행을 거절했고, qmon 수집기에는 그 이벤트가 보이지 않았습니다. 수집 지점과 차단의 정확한 순서는 확인하지 못했습니다.
나중에 봉쇄기(guard)로 같은 실제 VM을 볼 때는 더 적게 보였습니다. 외부 연결과 실행 권한 변경만 기록됐습니다. seccomp가 프로그램 실행을, AppArmor가 민감 파일 열기를 먼저 막았고, 주입기가 열려던 가짜 디스크 파일은 없어서 file_open 훅이 불리지 않았습니다.
이 결과를 보고 qmon의 역할을 다시 정했습니다. 이미 seccomp와 AppArmor가 막는 행동은 그쪽에 맡기고, qmon은 실험에서 기존 보호 계층을 통과해 관찰된 외부 연결 같은 행동을 살피는 보완 도구로 보기로 했습니다.

봉쇄도 실제 VM에서 확인했습니다. `--enforce --auto-contain 3`으로 띄우고 외부 연결을 3번 시도하게 했더니, 1번째와 2번째는 기록만 하고 3번째는 차단했습니다. 차단 기능을 켰을 때 시스템 콜 한 번에 드는 시간은 1.473us에서 1.567us로 약 6% 늘었습니다.

### 3-8. 틀렸던 것들

- 처음 얻은 5/5 탐지, 오탐 0이라는 결과는 정상 기준선을 `qemu --version`으로 배운 것이었습니다. 실제 VM을 돌리는 QEMU가 아니어서 이 수치는 버렸습니다. 좋아 보이는 결과가 가장 의심해야 할 결과라는 것을 배웠습니다.
- 스냅샷 정리 스크립트가 앞 단계가 실패했는데도 파일을 지워서, 테스트 VM이 디스크 없이 남은 적이 있습니다. 데이터는 잃지 않았지만, 지우는 동작은 앞 단계 성공을 확인한 뒤에만 해야 한다는 규칙을 세웠습니다.
- `/proc/<pid>/stat`을 공백으로 나눠 읽다가, 스레드 이름 `CPU 0/KVM`에 공백이 있어서 vCPU 스레드를 커널 스레드로 잘못 본 적이 있습니다. 마지막 `)` 뒤부터 읽도록 고쳤습니다.

## 4. 부족했던 점

- 실제 CVE로 VM escape를 재현하지 못했습니다. 지금 결과는 탈출 뒤 행동을 흉내 낸 것이라, 진짜 공격에서도 같을지는 아직 모릅니다.
- 정상 기준선이 빈약합니다. 쉬고 있는 VM은 행동이 거의 없어서, vCPU를 많이 쓰는 작업을 돌릴 때의 오탐은 아직 재 보지 못했습니다.
- 반복 측정이 5번뿐이고, 입력이 일정해서 분산을 제대로 보지 못했습니다.
- 비교 규칙의 수준이 도구마다 달라서, 오탐 비교가 완전히 공정하다고 말하기 어렵습니다.
- 탐지기는 모은 기록을 나중에 판정하는 방식이라, 실시간 탐지 지연이라고 부르기는 어렵습니다.
- 상대 경로로 연 파일은 기준 디렉터리를 풀지 못해서 경로 분류가 정확하지 않습니다.

## 5. 앞으로 할 것

- 공개된 QEMU CVE 3~5개를 격리된 환경에서 재현하고, 공격 시각과 행동을 미리 적어 둔 정답지와 qmon 결과를 맞춰 보겠습니다.
- 실제 작업(디스크, 네트워크, vCPU를 많이 쓰는 작업)을 돌리면서 기준선을 다시 배우고 오탐을 재겠습니다.
- 초당 이벤트 수를 올려 가며 수집기가 언제부터 이벤트를 놓치는지 측정하겠습니다.
- 다른 VM 디스크 열기도 커널에서 막을 수 있도록, VM별 디스크 목록을 eBPF 맵에 미리 넣어 두는 방식을 시험하겠습니다.
- 이 결과로 VM escape 탐지 논문 실험을 진행하겠습니다.
