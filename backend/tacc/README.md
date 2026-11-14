# TACC and the Qwen endpoint

This project uses the course's public Qwen service. The checked-in TACC service job is adapted from `Samples/project-release-1.zip`; it uses the course managed `proxy` environment and the shared project activation script. The private-vLLM sample is not required for this project because it is for modifying vLLM itself.

## Start the model service

Install/configure the official `tcloud` SDK and set up the account using the matching course supplied public sample instructions. Keep the sample's `setup-sdk-account.sh`, `job.sh`, and `tuxiv.conf` together; do not copy credentials or private keys into this repository.

From `backend/tacc/serve` on a TACC SDK client:

```bash
tcloud submit
tcloud ps -j YOUR_SERVICE_JOB_ID
tcloud cat slurm_log/fitpilot-qwen-serve-YOUR_SERVICE_JOB_ID.log
```

Wait for `Application startup complete`. Copy the `SERVICE_BASE_URL` printed in that log. The address is temporary and changes when the service restarts. Stop the service when finished with `tcloud cancel -j YOUR_SERVICE_JOB_ID`.

## Connect the backend

The FastAPI backend reads the current TACC address from `QWEN_BASE_URL`, including its `/v1` path. Set it only in your local shell or a private `.env`; never commit a live node address or credentials.

```bash
cd backend
QWEN_BASE_URL='http://NODE:8000/v1' .venv/bin/python -m uvicorn app.main:app --reload
```

You can instead put `QWEN_BASE_URL` and `QWEN_MODEL` in a private `backend/.env` and use `python3 scripts/dev.py` from the project root, or add `--env-file .env` to the backend command. A bare Uvicorn command does not automatically load that file. Generic `LLM_BASE_URL` configuration takes precedence over Qwen configuration when set.

The sample package explicitly runs Qwen client calls from a TACC job. A local laptop may not be able to reach the service node directly. `/api/health` identifies whether model configuration is present; `/api/model/status` makes a real bounded test request. Each agent result separately identifies live inference or local fallback and preserves fallback details. Run the API in an environment with TACC network access before expecting live model responses. Do not expose a TACC node or start a public tunnel; follow the course's approved networking/deployment instructions.

The local Vite development server proxies `/api` requests to FastAPI at port 8000. `VITE_API_URL` can override the browser's API base if an intentional deployment requires it; avoid putting model credentials or node URLs in the frontend. FastAPI can also serve `frontend/dist` when the frontend has been built before backend startup. Hosting the web app and API so a browser can reach a TACC job needs course-approved ingress or a client-job workflow; the supplied samples do not configure web ingress. No such route is assumed in this scaffold.
