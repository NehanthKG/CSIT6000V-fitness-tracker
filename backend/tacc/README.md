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
QWEN_BASE_URL='http://NODE:8000/v1' uvicorn app.main:app --reload
```

The sample package explicitly runs Qwen client calls from a TACC job. A local laptop may not be able to reach the service node directly. If the API reports `Starter mode`, the URL is missing or the model request failed. Run the API in an environment with TACC network access before expecting live model responses. Do not expose a TACC node or start a public tunnel; follow the course's approved networking/deployment instructions.

The React frontend talks to FastAPI at `http://localhost:8000` during local development. Hosting the web app and API so a browser can reach a TACC job needs course-approved ingress or a client-job workflow; the supplied samples do not configure web ingress. No such route is assumed in this scaffold.
