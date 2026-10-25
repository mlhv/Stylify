# Handoff: train the classifier on the gaming PC (WSL2)

Date: 2026-10-25. For a Claude Code session running inside WSL2 on Minh's gaming PC (RTX 5070). You have not seen this repo before. Read `AGENTS.md`, then this file. Background, if you need it: `docs/superpowers/specs/2026-10-25-classifier-retrain-design.md` and `docs/superpowers/plans/2026-10-25-classifier-retrain.md`.

## Your job

Train the iPhone app's clothing classifier on this PC's GPU and send the results back to the Mac. Concretely:

1. Set up: install the ML project, check the GPU, copy the training data from the Mac.
2. Run `sweeps/first.json` (one run), note how long it took, and send it to the Mac.
3. Run `sweeps/sweep.json` (the first run plus six variants, most useful first) until **21:30 local time**, sending each finished run to the Mac.
4. Write a short handoff back (below), commit it, push the branch.

You do not export models, change the app, or pick the winner: the Mac session does that after 21:30. Do not change training code unless a run cannot start; if you must, say so in your handoff.

## Rules

- **Never commit, upload or print data**: nothing under `~/stylify-data/` goes into git or anywhere online. The datasets' licences forbid it, and `personal/` holds Minh's own photos.
- Work only on branch `ml/room-retrain`. Never push `main`.
- Keep the data on WSL's own disk (`~/stylify-data`), not under `/mnt/c`: it is far faster.
- The training queue is safe to stop (Ctrl-C) and start again with the same command: finished runs are skipped, a run that finished training but not evaluation is just evaluated, and an interrupted run is moved to `runs/_failed/` and trained again from the start (the time it had is lost). Only one queue can run at a time; a second one exits with "already running". Never start a second queue because you think the first died: check `ps aux | grep stylify_ml` first.

## Before you start: what Minh does

Ask Minh to confirm each of these:

1. **Windows sleep is off while training** (Settings → System → Power: "When plugged in, put my device to sleep after: Never"). A sleeping PC kills the run.
2. **Remote Login is on on the Mac** (System Settings → General → Sharing → Remote Login), and Minh gives you the Mac's user name and its address shown there (for example `ml3787@Minhs-MacBook.local` or `ml3787@192.168.1.23`).
3. From WSL, `ssh <mac-user>@<mac-host> echo ok` prints `ok`. Set up an SSH key (`ssh-keygen`, then `ssh-copy-id <mac-user>@<mac-host>`) so rsync does not ask for a password each time. If WSL cannot reach the Mac (some routers isolate it; `.local` names may not resolve in WSL, so try the IP address), stop and tell Minh: the Mac session will run the first job on Kaggle instead.

## Steps

```bash
# 1. Code (WSL home, not /mnt/c)
cd ~ && git clone https://github.com/mlhv/Stylify.git Stylify && cd Stylify && git switch ml/room-retrain
cd ml

# 2. Set up: GPU check, uv, Python environment without ExecuTorch, data from the Mac
scripts/pc_setup.sh <mac-user>@<mac-host>
```

`pc_setup.sh` must end with a line like `torch 2.14.1, CUDA 13.x, NVIDIA GeForce RTX 5070, compute capability 12.0: OK` and print counts (the locked torch wheel is built for CUDA 13; that is expected). The Mac had **127,126** manifest rows and the same number of crop files when this was written; tell Minh if they differ.

If the CUDA check fails: check `nvidia-smi` works in WSL (if not, the Windows driver needs updating; WSL needs no Linux driver). The CUDA 13 wheel needs a Windows NVIDIA driver **580 or newer**: if `nvidia-smi` works but shows an older driver, `torch.cuda.is_available()` is False; ask Minh to update the driver in the NVIDIA app on Windows, then run `wsl --shutdown` from Windows and start again. If PyTorch says the GPU's compute capability is not supported, stop and report it with the exact message; do not change the pinned torch version without asking.

```bash
# 3. The first run (also measures how long one run takes)
uv run --no-group export python -m stylify_ml.jobqueue --data ~/stylify-data --jobs sweeps/first.json --stop-at 21:30
scripts/pc_send_runs.sh <mac-user>@<mac-host>
```

Run long commands so they survive your session: for example in `tmux` (`sudo apt-get install -y tmux`), or with your background-command tool, and watch `~/stylify-data/logs/<run-id>.log`. The queue prints how long each run took.

Each epoch prints `phase n/N loss … val bacc …`. Validation balanced accuracy around 0.90–0.93 is normal. If the first run's GPU sits idle a lot (check `nvidia-smi`), the image loading is the bottleneck: the jobs use `--workers 8`; try 12 or 16 in the JSON if the CPU has the cores, and say so in your handoff.

```bash
# 4. The sweep, until 21:30 (the first run is skipped as already finished)
uv run --no-group export python -m stylify_ml.jobqueue --data ~/stylify-data --jobs sweeps/sweep.json --stop-at 21:30
```

`--stop-at 21:30` does not start a run that would not finish by then, judged by the longest run so far. Once the first run's time is known, you may reorder or trim `sweeps/sweep.json` so the most useful runs fit; keep the order roughly as it is (Carousell weight 2 and 8 first, then strong augmentation, learning rate, epochs, and mobilenet last). Commit any change to the file.

After **each** finished run, send it: `scripts/pc_send_runs.sh <mac-user>@<mac-host>`. That lets the Mac compare runs while the rest train. `--compare` works here too (`uv run --no-group export python -m stylify_ml.evaluate --data ~/stylify-data --compare --baseline 20261022-180946-efficientnet_b0`), but shows `-` for `.pte` size because ExecuTorch is not installed here.

## When you are done (or at 21:30)

Write `docs/superpowers/handoffs/2026-10-25-pc-training-results.md` with: which runs finished and how long each took; anything odd (errors, a run moved to `_failed/`, GPU idle); any change you made to the sweep file or the code; and the last `pc_send_runs.sh` time. Then:

```bash
git add docs/superpowers/handoffs/2026-10-25-pc-training-results.md ml/sweeps
git commit -m "docs: PC training results"
git push origin ml/room-retrain
```

A fresh WSL may have no git identity or GitHub login: set `git config user.name "Minh Le"` and `git config user.email` to the address Minh gives you, and use `gh auth login` (or ask Minh for a token) to push. If pushing is not possible, copy the file to the Mac instead: `rsync -a docs/superpowers/handoffs/2026-10-25-pc-training-results.md <mac-user>@<mac-host>:Stylify/docs/superpowers/handoffs/`.

Tell Minh it is done. If a run is still training at 21:30, leave it running and say so: the Mac picks from whatever has arrived.
