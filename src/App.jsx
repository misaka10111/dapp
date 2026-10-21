import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, getAddress } from "ethers";
import {
  CONFIGURED,
  CONFIG_ERROR,
  CONTRACT_ADDRESS,
  EXPLORER,
  RPC_URL,
  SEPOLIA_CHAIN_ID,
  browserProvider,
  checkedContract,
  injectedWallet,
  readProvider,
  switchToSepolia,
} from "./contract.js";
import {
  budget,
  errorMessage,
  eth,
  matchesFilter,
  percent,
  positiveEth,
  safeUrl,
  shortAddress,
} from "./utils.js";

const STATUS = ["Funding", "Successful", "Failed", "Completed"];
const TONE = ["funding", "successful", "failed", "completed"];
const PAGE_SIZE = 6;

const FILTERS = [
  { key: "all", label: "All projects" },
  { key: "mine", label: "Created by me" },
  { key: "backed", label: "I backed" },
  { key: "review", label: "Needs my approval" },
];

function Badge({ status, expired }) {
  return (
    <span className={`badge badge-${expired ? "pending" : TONE[status]}`}>
      <i />
      {expired ? "Awaiting finalization" : STATUS[status]}
    </span>
  );
}

function Progress({ value, label, tone }) {
  return (
    <div
      className={`progress${tone ? ` tone-${tone}` : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, value)}
    >
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function Eth({ value }) {
  return (
    <span className="amount">
      {eth(value)} <small>ETH</small>
    </span>
  );
}

function Skeleton() {
  return (
    <div className="project-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton-card" key={i} />
      ))}
    </div>
  );
}

function CreateProject({ ready, busy, transact, onCreated }) {
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const target = positiveEth(data.target);
      const deadline = Math.floor(new Date(data.deadline).getTime() / 1000);
      if (!Number.isFinite(deadline) || deadline <= Date.now() / 1000)
        throw new Error("Choose a deadline in the future.");
      for (const [key, max] of [
        ["name", 120],
        ["description", 4000],
        ["firstGoal", 2000],
        ["secondGoal", 2000],
      ]) {
        data[key] = data[key].trim();
        if (!data[key] || new TextEncoder().encode(data[key]).length > max)
          throw new Error(`${key}: enter 1–${max} UTF-8 bytes.`);
      }
      if (
        await transact("Create project", (c) =>
          c.createProject(
            data.name,
            data.description,
            target,
            deadline,
            data.firstGoal,
            data.secondGoal,
          ),
        )
      )
        onCreated();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="panel create-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">New campaign</p>
          <h2>Create a project</h2>
        </div>
      </div>
      <p className="muted">
        Set the funding target, the deadline, and the two deliverables backers
        will approve.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={!ready || busy}>
          <label>
            Project name
            <input
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Campus NFT ticketing"
            />
          </label>
          <label>
            Project description
            <textarea
              name="description"
              required
              maxLength={4000}
              rows={3}
              placeholder="What are you building, and why should backers fund it?"
            />
          </label>
          <div className="form-grid">
            <label>
              Funding goal · ETH
              <input
                name="target"
                inputMode="decimal"
                required
                placeholder="0.01"
              />
            </label>
            <label>
              Funding deadline · your local time
              <input name="deadline" type="datetime-local" required />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Milestone 1 · 40% of funds
              <textarea
                name="firstGoal"
                required
                maxLength={2000}
                rows={3}
                placeholder="First deliverable backers will review"
              />
            </label>
            <label>
              Milestone 2 · remaining 60%
              <textarea
                name="secondGoal"
                required
                maxLength={2000}
                rows={3}
                placeholder="Final deliverable backers will review"
              />
            </label>
          </div>
          <p className="form-note">
            Target, deadline and the 40 / 60 split are permanent after
            creation. Gas is paid separately, and backers must approve each
            milestone before funds are released.
          </p>
          <button className="primary" type="submit">
            Create on Sepolia <span>↗</span>
          </button>
        </fieldset>
        {!ready && (
          <p className="muted" style={{ marginTop: 12 }}>
            Configure the contract and connect MetaMask on Sepolia to create a
            project.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

function ProjectDetails({ data, account, ready, busy, now, transact, onClose }) {
  const {
    project: p,
    milestones,
    contribution,
    refunded,
    approvals,
    id,
  } = data;
  const [error, setError] = useState("");
  const isCreator =
    account && account.toLowerCase() === p.creator.toLowerCase();
  const expired = p.status === 0n && now >= Number(p.deadline);

  async function contribute(event) {
    event.preventDefault();
    setError("");
    try {
      const amount = positiveEth(
        new FormData(event.currentTarget).get("amount"),
      );
      const form = event.currentTarget;
      if (
        await transact("Contribute", (c) => c.contribute(id, { value: amount }))
      )
        form.reset();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function evidence(event, index) {
    event.preventDefault();
    setError("");
    try {
      const fields = new FormData(event.currentTarget);
      const text = fields.get("evidence").trim(),
        url = fields.get("url").trim();
      if (!safeUrl(url))
        throw new Error("Use a complete HTTP or HTTPS GitHub / demo URL.");
      if (
        !text ||
        new TextEncoder().encode(text).length > 4000 ||
        new TextEncoder().encode(url).length > 1000
      )
        throw new Error(
          "Evidence must be 1–4000 UTF-8 bytes and URL at most 1000 bytes.",
        );
      await transact(`Submit milestone ${index + 1}`, (c) =>
        c.submitEvidence(id, index, text, url),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="detail-panel" aria-label="Project details">
      <div className="detail-head">
        <p className="eyebrow">Project #{id.toString().padStart(3, "0")}</p>
        <div className="detail-head-actions">
          <Badge status={Number(p.status)} expired={expired} />
          <button
            className="icon-button"
            aria-label="Close project details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      <h2>{p.name}</h2>
      <p className="description">{p.description}</p>
      <p className="creator-line">
        Created by{" "}
        <a
          href={`${EXPLORER}/address/${p.creator}`}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddress(p.creator)}
        </a>
        {isCreator && " · this is you"}
      </p>

      <div className="funding-number">
        <Eth value={p.totalRaised} />
        <span className="muted">of {eth(p.target)} ETH goal</span>
      </div>
      <Progress
        value={percent(p.totalRaised, p.target)}
        label="Funding progress"
        tone={p.status === 2n ? "muted" : p.status === 0n ? undefined : "success"}
      />

      <div className="detail-stats">
        <div className="stat">
          <span>Deadline</span>
          <strong>{new Date(Number(p.deadline) * 1000).toLocaleString()}</strong>
        </div>
        <div className="stat">
          <span>Held in escrow</span>
          <strong>
            <Eth value={p.escrowBalance} />
          </strong>
        </div>
        <div className="stat">
          <span>Your contribution</span>
          <strong>
            <Eth value={contribution} />
          </strong>
        </div>
        <div className="stat">
          <span>Funding goal</span>
          <strong>
            <Eth value={p.target} />
          </strong>
        </div>
      </div>

      {refunded && (
        <p className="success-note">
          ✓ Your original contribution has been refunded.
        </p>
      )}

      {p.status === 0n &&
        !expired &&
        (isCreator ? (
          <p className="notice inline">
            <strong>You are the creator of this project</strong>
            <p>Creators cannot fund their own campaign.</p>
          </p>
        ) : (
          <form className="contribute-form" onSubmit={contribute}>
            <label>
              Support this project · Sepolia ETH
              <input
                name="amount"
                aria-label="Contribution ETH"
                inputMode="decimal"
                placeholder="0.01"
                required
                disabled={!ready || busy}
              />
            </label>
            <button className="primary" disabled={!ready || busy}>
              Contribute ↗
            </button>
          </form>
        ))}

      {expired && (
        <div className="notice network-notice">
          <div>
            <strong>Deadline passed without reaching the goal</strong>
            <p>Finalize funding to enable full refunds for every backer.</p>
          </div>
          <button
            disabled={!ready || busy}
            onClick={() =>
              transact("Finalize funding", (c) => c.finalizeFunding(id))
            }
          >
            Finalize funding
          </button>
        </div>
      )}

      {p.status === 2n && contribution > 0n && !refunded && (
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={() => transact("Claim refund", (c) => c.claimRefund(id))}
        >
          Claim refund · {eth(contribution)} ETH
        </button>
      )}

      {p.status === 3n && (
        <p className="success-note">
          ✓ Both milestones are complete. All project funds have been released.
        </p>
      )}

      <div className="section-heading milestone-heading">
        <h3>The milestones</h3>
        <span>Evidence → Approval → Withdrawal</span>
      </div>

      {milestones.map((m, index) => {
        const current = p.status === 1n && BigInt(index) === p.currentMilestone;
        const projected = p.status === 0n;
        const stateLabel = m.withdrawn
          ? "Released"
          : m.approved
            ? "Approved"
            : m.submitted
              ? "In review"
              : current
                ? "Awaiting evidence"
                : "Pending";
        const stateClass = m.withdrawn
          ? "is-released"
          : m.approved
            ? "is-approved"
            : m.submitted
              ? "is-review"
              : "";
        return (
          <article
            className={`milestone ${m.withdrawn ? "done" : ""} ${current ? "current" : ""}`}
            key={index}
          >
            <div className="milestone-top">
              <span className="milestone-number">0{index + 1}</span>
              <div>
                <h4>
                  Milestone {index + 1}
                  <span className="share">{index === 0 ? "40%" : "60%"}</span>
                </h4>
                <p>{m.goal}</p>
              </div>
              <span className={`milestone-state ${stateClass}`}>
                {stateLabel}
              </span>
            </div>

            <div className="stage-meta">
              <span>
                {projected ? "Projected budget" : "Stage budget"}:{" "}
                <b>
                  {projected && p.totalRaised === 0n
                    ? "—"
                    : `${eth(budget(p.totalRaised, index))} ETH`}
                </b>
              </span>
              {m.withdrawn && (
                <span>
                  Released: <b>{eth(m.withdrawnAmount)} ETH</b>
                </span>
              )}
              {projected && p.totalRaised > 0n && (
                <span>based on {eth(p.totalRaised)} ETH raised so far</span>
              )}
            </div>

            {m.submitted && (
              <div className="evidence">
                <p className="eyebrow">Creator’s evidence</p>
                <p>{m.evidence}</p>
                {safeUrl(m.evidenceUrl) ? (
                  <a
                    href={safeUrl(m.evidenceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open GitHub / demo ↗
                  </a>
                ) : (
                  <p className="muted">Unsupported link: {m.evidenceUrl}</p>
                )}
              </div>
            )}

            <div className="approval-caption">
              <span>
                Approval weight · {eth(m.approvalWeight)} /{" "}
                {eth(p.totalRaised)} ETH
              </span>
              <strong>{percent(m.approvalWeight, p.totalRaised)}%</strong>
            </div>
            <Progress
              value={percent(m.approvalWeight, p.totalRaised)}
              label={`Milestone ${index + 1} approval`}
              tone={m.approved ? "success" : undefined}
            />
            <p className="form-note">
              Strictly more than 50% of contributed weight is required. Exactly
              50% does not pass.
            </p>

            <div className="milestone-actions">
              {current && !m.submitted && isCreator && (
                <form style={{ width: "100%" }} onSubmit={(e) => evidence(e, index)}>
                  <fieldset disabled={!ready || busy}>
                    <label>
                      What did you deliver?
                      <textarea
                        name="evidence"
                        required
                        maxLength={4000}
                        rows={3}
                        placeholder="Summarise the deliverable for your backers"
                      />
                    </label>
                    <label>
                      GitHub / demo URL
                      <input
                        name="url"
                        type="url"
                        required
                        maxLength={1000}
                        placeholder="https://github.com/…"
                      />
                    </label>
                    <button className="primary">Submit evidence</button>
                  </fieldset>
                </form>
              )}
              {current && m.submitted && !m.approved && contribution > 0n && (
                <button
                  className="primary"
                  disabled={!ready || busy || approvals[index]}
                  onClick={() =>
                    transact(`Approve milestone ${index + 1}`, (c) =>
                      c.approveMilestone(id, index),
                    )
                  }
                >
                  {approvals[index]
                    ? "You have approved this milestone"
                    : `Approve · ${eth(contribution)} ETH weight`}
                </button>
              )}
              {current && m.approved && !m.withdrawn && isCreator && (
                <button
                  className="primary"
                  disabled={!ready || busy}
                  onClick={() =>
                    transact(`Withdraw milestone ${index + 1}`, (c) =>
                      c.withdrawMilestone(id, index),
                    )
                  }
                >
                  Withdraw · {eth(budget(p.totalRaised, index))} ETH ↗
                </button>
              )}
            </div>
          </article>
        );
      })}

      {!ready && (
        <p className="form-note">Connect MetaMask on Sepolia to take part.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="risk-note">
        Prototype limitation: after successful funding, funds may remain locked
        indefinitely if backers do not approve. There is no voting deadline or
        partial refund.
      </p>
    </section>
  );
}

export default function App() {
  const [account, setAccount] = useState(""),
    [chain, setChain] = useState(null);
  const [tab, setTab] = useState("explore"),
    [projects, setProjects] = useState([]),
    [count, setCount] = useState(0n);
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("all"),
    [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [walletError, setWalletError] = useState(""),
    [walletBusy, setWalletBusy] = useState(false);
  const [tx, setTx] = useState(null),
    [history, setHistory] = useState([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const requestId = useRef(0),
    txLock = useRef(false),
    walletEpoch = useRef(0),
    refreshRef = useRef(null),
    detailRef = useRef(null);
  const ready = CONFIGURED && !!account && chain === SEPOLIA_CHAIN_ID;
  const busy = tx?.status === "wallet" || tx?.status === "pending";

  // Read-only requests never request a signer or wallet authorization.
  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    if (!CONFIGURED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    let provider;
    try {
      provider = readProvider();
      const contract = await checkedContract(provider);
      // One block snapshot keeps project totals, approvals and escrow consistent.
      const snapshot = { blockTag: await provider.getBlockNumber() };
      const total = await contract.projectCount(snapshot);
      const start = total - 1n - BigInt(page * PAGE_SIZE);
      const ids = Array.from(
        { length: PAGE_SIZE },
        (_, i) => start - BigInt(i),
      ).filter((id) => id >= 0n);
      const [rows, details] = await Promise.all([
        Promise.all(
          ids.map(async (id) => {
            const project = await contract.getProject(id, snapshot);
            const row = { id, ...project.toObject() };
            if (!account) return row;
            // Extra per-row data powers the "I backed" / "needs my approval"
            // filters. Reads only, so no wallet prompt.
            const stage = Number(project.currentMilestone);
            const [contribution, approvedNow] = await Promise.all([
              contract.contributions(id, account, snapshot),
              contract.hasApproved(id, stage, account, snapshot),
            ]);
            const extra = {
              contribution,
              approvedNow,
              submitted: false,
              approved: false,
            };
            if (Number(project.status) === 1) {
              const milestone = await contract.getMilestone(id, stage, snapshot);
              extra.submitted = milestone.submitted;
              extra.approved = milestone.approved;
            }
            return { ...row, ...extra };
          }),
        ),
        selected === null
          ? null
          : (async () => {
              const [project, first, second, contribution, refunded, a0, a1] =
                await Promise.all([
                  contract.getProject(selected, snapshot),
                  contract.getMilestone(selected, 0, snapshot),
                  contract.getMilestone(selected, 1, snapshot),
                  account
                    ? contract.contributions(selected, account, snapshot)
                    : 0n,
                  account
                    ? contract.refunded(selected, account, snapshot)
                    : false,
                  account
                    ? contract.hasApproved(selected, 0, account, snapshot)
                    : false,
                  account
                    ? contract.hasApproved(selected, 1, account, snapshot)
                    : false,
                ]);
              return {
                id: selected,
                project: project.toObject(),
                milestones: [first.toObject(), second.toObject()],
                contribution,
                refunded,
                approvals: [a0, a1],
              };
            })(),
      ]);
      if (request !== requestId.current) return;
      setCount(total);
      setProjects(rows);
      setDetail(details);
      setLastUpdated(new Date());
    } catch (e) {
      if (request === requestId.current) {
        setLoadError(errorMessage(e));
        setProjects([]);
        setDetail(null);
      }
    } finally {
      provider?.destroy();
      if (request === requestId.current) setLoading(false);
    }
  }, [account, chain, page, selected]);
  refreshRef.current = refresh;

  useEffect(() => {
    setDetail(null);
    refresh();
    const poll = setInterval(refresh, 15000);
    return () => {
      clearInterval(poll);
      requestId.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(
        () => setNow(Math.floor(Date.now() / 1000)),
        1000,
      ),
      wallet = injectedWallet();
    if (!wallet) return () => clearInterval(timer);
    let live = true;
    const accountsChanged = (accounts) => {
      walletEpoch.current++;
      if (live) {
        setDetail(null);
        setAccount(accounts[0] ? getAddress(accounts[0]) : "");
      }
    };
    const chainChanged = (chainId) => {
      walletEpoch.current++;
      if (live) setChain(BigInt(chainId));
    };
    const disconnected = () => {
      walletEpoch.current++;
      if (live) {
        setAccount("");
        setChain(null);
      }
    };
    wallet.on("accountsChanged", accountsChanged);
    wallet.on("chainChanged", chainChanged);
    wallet.on("disconnect", disconnected);
    const initialEpoch = walletEpoch.current;
    Promise.all([
      wallet.request({ method: "eth_accounts" }),
      wallet.request({ method: "eth_chainId" }),
    ])
      .then(([accounts, chainId]) => {
        if (live && walletEpoch.current === initialEpoch) {
          setAccount(accounts[0] ? getAddress(accounts[0]) : "");
          setChain(BigInt(chainId));
        }
      })
      .catch((e) => {
        if (live) setWalletError(errorMessage(e));
      });
    return () => {
      live = false;
      clearInterval(timer);
      wallet.removeListener("accountsChanged", accountsChanged);
      wallet.removeListener("chainChanged", chainChanged);
      wallet.removeListener("disconnect", disconnected);
    };
  }, []);

  // Bring the detail panel into view once a project is opened.
  useEffect(() => {
    if (detail && detailRef.current)
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [detail?.id]);

  // Clear finished transaction banners automatically; errors linger a bit longer.
  useEffect(() => {
    if (!tx || tx.status === "wallet" || tx.status === "pending") return;
    const timeout = setTimeout(
      () => setTx(null),
      tx.status === "error" ? 12000 : 7000,
    );
    return () => clearTimeout(timeout);
  }, [tx]);

  async function connect() {
    setWalletBusy(true);
    setWalletError("");
    let provider;
    try {
      provider = browserProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0] ? getAddress(accounts[0]) : "");
      setChain((await provider.getNetwork()).chainId);
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      provider?.destroy();
      setWalletBusy(false);
    }
  }
  async function switchNetwork() {
    setWalletBusy(true);
    setWalletError("");
    try {
      await switchToSepolia();
      setChain(
        BigInt(await injectedWallet().request({ method: "eth_chainId" })),
      );
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setWalletBusy(false);
    }
  }
  // Acquire a fresh signer for every operation to avoid using a previous account.
  async function transact(label, send) {
    if (txLock.current) return null;
    txLock.current = true;
    setTx({ status: "wallet", label });
    let provider, hash;
    try {
      if (!ready)
        throw new Error(
          "Configure the contract and connect MetaMask on Sepolia.",
        );
      const epoch = walletEpoch.current;
      provider = new BrowserProvider(injectedWallet());
      provider.pollingInterval = 1000;
      const contract = await checkedContract(provider),
        signer = await provider.getSigner(account);
      if (
        walletEpoch.current !== epoch ||
        (await signer.getAddress()).toLowerCase() !== account.toLowerCase()
      )
        throw new Error("Wallet changed. Review the account and try again.");
      const response = await send(contract.connect(signer));
      hash = response.hash;
      setTx({ status: "pending", label, hash });
      let receipt;
      try {
        receipt = await response.wait(1);
      } catch (e) {
        if (e.code !== "TRANSACTION_REPLACED") throw e;
        hash = e.replacement?.hash ?? hash;
        if (e.cancelled)
          throw new Error(
            "Transaction cancelled or replaced in MetaMask. Check Etherscan before retrying.",
          );
        receipt = e.receipt;
      }
      if (!receipt || receipt.status !== 1)
        throw new Error("Transaction reverted. Check Etherscan.");
      const result = { status: "success", label, hash: receipt.hash };
      setTx(result);
      setHistory((items) => [result, ...items].slice(0, 12));
      await refreshRef.current();
      return receipt;
    } catch (e) {
      setTx({ status: "error", label, hash, message: errorMessage(e) });
      return null;
    } finally {
      provider?.destroy();
      txLock.current = false;
    }
  }

  const visible = useMemo(
    () => projects.filter((p) => matchesFilter(filter, p, account)),
    [projects, filter, account],
  );
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.key,
          projects.filter((p) => matchesFilter(f.key, p, account)).length,
        ]),
      ),
    [projects, account],
  );
  const networkState =
    chain === null ? "idle" : chain === SEPOLIA_CHAIN_ID ? "ok" : "wrong";

  return (
    <div className="shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => setTab("explore")}>
            <span className="brand-mark">M</span>
            MilestoneFund
          </button>
          <nav aria-label="Main navigation">
            <button
              className={tab === "explore" ? "active" : ""}
              onClick={() => setTab("explore")}
            >
              Explore
            </button>
            <button
              className={tab === "create" ? "active" : ""}
              onClick={() => setTab("create")}
            >
              Create project
            </button>
          </nav>
          <div className="wallet-controls">
            <span className={`network ${networkState}`}>
              <i />
              {chain === null
                ? "Wallet not connected"
                : chain === SEPOLIA_CHAIN_ID
                  ? "Sepolia testnet"
                  : "Wrong network"}
            </span>
            <button
              className={`wallet-button ${account ? "connected" : ""}`}
              disabled={walletBusy}
              onClick={connect}
            >
              {walletBusy
                ? "Connecting…"
                : account
                  ? shortAddress(account)
                  : "Connect MetaMask"}
              <span>↗</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {tab === "explore" && (
          <section className="page-intro">
            <div className="hero-grid">
              <div>
                <p className="eyebrow">COMP7610 · Sepolia testnet</p>
                <h1>Fund work in two approved milestones.</h1>
                <p className="lede">
                  Backers pool test ETH into escrow. The creator delivers,
                  backers approve with the weight they contributed, and funds
                  unlock 40% / 60% — no platform in the middle.
                </p>
              </div>
              <div className="flow">
                <div className="flow-step">
                  <span className="flow-num">1</span>
                  <div>
                    <strong>Contribute before the deadline</strong>
                    <span className="body">
                      Every contribution is recorded on-chain with its weight.
                    </span>
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-num">2</span>
                  <div>
                    <strong>Creator submits evidence</strong>
                    <span className="body">
                      A summary plus a GitHub or demo link for each milestone.
                    </span>
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-num">3</span>
                  <div>
                    <strong>Backers approve, funds release</strong>
                    <span className="body">
                      More than 50% of weight unlocks 40%, then the remaining
                      60%.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!CONFIGURED && (
          <aside className="notice config-notice" role="status">
            <div>
              <strong>
                {CONFIG_ERROR
                  ? "Configuration needs attention"
                  : "Sepolia contract not configured"}
              </strong>
              <p>
                {CONFIG_ERROR ||
                  "No contract is configured yet. Deploy contracts/MilestoneFund.sol in Remix, put its address in VITE_CONTRACT_ADDRESS in .env.local, then restart Vite. Real project data will appear here."}
              </p>
            </div>
          </aside>
        )}

        {chain !== null && chain !== SEPOLIA_CHAIN_ID && (
          <aside className="notice network-notice">
            <div>
              <strong>Switch your wallet to Sepolia</strong>
              <p>
                Project transactions require the Ethereum Sepolia test network.
              </p>
            </div>
            <button disabled={walletBusy} onClick={switchNetwork}>
              Switch to Sepolia
            </button>
          </aside>
        )}

        {walletError && (
          <p className="error" role="alert">
            {walletError}
          </p>
        )}

        {tab === "create" ? (
          <CreateProject
            ready={ready}
            busy={busy}
            transact={transact}
            onCreated={() => {
              setPage(0);
              setTab("explore");
            }}
          />
        ) : (
          <section className="projects-section" id="projects">
            <div className="section-heading">
              <div>
                <h2>
                  Explore projects{" "}
                  <span className="count">
                    {CONFIGURED && !loadError ? count.toString() : "—"}
                  </span>
                </h2>
              </div>
              <button
                className="text-button"
                onClick={refresh}
                disabled={loading || !CONFIGURED}
              >
                {loading ? "Loading…" : "Refresh ↻"}
              </button>
            </div>

            {!loadError && projects.length > 0 && (
              <div className="toolbar">
                <div className="filters" role="tablist" aria-label="Filters">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={filter === f.key}
                      className={filter === f.key ? "active" : ""}
                      disabled={f.key !== "all" && !account}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      <em>{filterCounts[f.key] ?? 0}</em>
                    </button>
                  ))}
                </div>
                <span className="stamp">
                  {!account
                    ? "Connect MetaMask to filter by your activity"
                    : lastUpdated
                      ? `Updated ${lastUpdated.toLocaleTimeString()} · auto-refresh 15s`
                      : ""}
                </span>
              </div>
            )}

            {loadError ? (
              <div className="notice error" role="alert">
                <strong>Could not load on-chain data</strong>
                <p>{loadError}</p>
                {!RPC_URL && (
                  <p>
                    Without optional VITE_SEPOLIA_RPC_URL, MetaMask must be
                    installed and set to Sepolia for read-only browsing.
                  </p>
                )}
              </div>
            ) : (
              <>
                {loading && !projects.length ? (
                  <Skeleton />
                ) : projects.length === 0 ? (
                  <div className="empty-state">
                    <h3>
                      {CONFIGURED
                        ? "No projects yet."
                        : "Contract not configured."}
                    </h3>
                    <p>
                      {CONFIGURED
                        ? "Nothing has been created on this contract yet. Start the first campaign."
                        : "Connect a deployed contract to explore real projects and their progress."}
                    </p>
                    <button className="primary" onClick={() => setTab("create")}>
                      Create a project <span>↗</span>
                    </button>
                  </div>
                ) : visible.length === 0 ? (
                  <div className="empty-state">
                    <h3>Nothing matches this filter</h3>
                    <p>
                      Filters apply to the {projects.length} projects loaded on
                      this page. Try another page or switch back to all projects.
                    </p>
                    <button onClick={() => setFilter("all")}>Show all</button>
                  </div>
                ) : (
                  <div className="project-grid">
                    {visible.map((p) => (
                      <button
                        className={`project-card ${selected === p.id ? "selected" : ""}`}
                        key={p.id.toString()}
                        onClick={() => setSelected(p.id)}
                        aria-pressed={selected === p.id}
                      >
                        <div className="card-top">
                          <span className="project-id">
                            PROJECT #{p.id.toString().padStart(3, "0")}
                          </span>
                          <Badge
                            status={Number(p.status)}
                            expired={p.status === 0n && now >= Number(p.deadline)}
                          />
                        </div>
                        <h3>{p.name}</h3>
                        <p className="card-description">{p.description}</p>
                        <div className="card-amount">
                          <Eth value={p.totalRaised} />
                          <span className="pct">
                            {percent(p.totalRaised, p.target)}%
                          </span>
                        </div>
                        <Progress
                          value={percent(p.totalRaised, p.target)}
                          label={`${p.name} funding`}
                          tone={
                            p.status === 2n
                              ? "muted"
                              : p.status === 0n
                                ? undefined
                                : "success"
                          }
                        />
                        <div className="card-bottom">
                          <span>of {eth(p.target)} ETH goal</span>
                          <span>View project ↗</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {count > BigInt(PAGE_SIZE) && (
                  <div className="pagination">
                    <button
                      className="ghost"
                      disabled={page === 0 || loading}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Newer
                    </button>
                    <span>
                      Page {page + 1} of{" "}
                      {Math.max(1, Math.ceil(Number(count) / PAGE_SIZE))}
                    </span>
                    <button
                      className="ghost"
                      disabled={
                        BigInt((page + 1) * PAGE_SIZE) >= count || loading
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Older →
                    </button>
                  </div>
                )}

                {detail && (
                  <div ref={detailRef}>
                    <ProjectDetails
                      key={`${detail.id}-${account}`}
                      data={detail}
                      account={account}
                      ready={ready}
                      busy={busy}
                      now={now}
                      transact={transact}
                      onClose={() => setSelected(null)}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section className="panel history">
            <h3>Your confirmed transactions · this session</h3>
            {history.map((item) => (
              <a
                key={item.hash}
                href={`${EXPLORER}/tx/${item.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>{item.label}</span>
                <span>{shortAddress(item.hash)} ↗</span>
              </a>
            ))}
          </section>
        )}
      </main>

      <footer>
        <span className="brand">
          <span className="brand-mark">M</span> MilestoneFund
        </span>
        <p>COMP7610 · A course prototype on Sepolia</p>
        {CONFIGURED ? (
          <a
            href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            Contract {shortAddress(CONTRACT_ADDRESS)} ↗
          </a>
        ) : (
          <span>Contract not configured</span>
        )}
      </footer>

      {tx && (
        <aside
          className={`toast toast-${tx.status}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast-icon">
            {tx.status === "success" ? (
              "✓"
            ) : tx.status === "error" ? (
              "!"
            ) : (
              <span className="spinner" />
            )}
          </span>
          <div className="toast-body">
            <strong>
              {tx.label} ·{" "}
              {tx.status === "wallet"
                ? "waiting for wallet confirmation"
                : tx.status === "pending"
                  ? "transaction processing"
                  : tx.status === "success"
                    ? "confirmed"
                    : "failed"}
            </strong>
            {tx.message && <p>{tx.message}</p>}
            {tx.hash && (
              <a
                href={`${EXPLORER}/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Etherscan ↗
              </a>
            )}
          </div>
          <button
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => setTx(null)}
          >
            ×
          </button>
        </aside>
      )}
    </div>
  );
}
