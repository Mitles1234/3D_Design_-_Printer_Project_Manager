const { useState, useRef, useEffect } = React;
const h = React.createElement;

const PS = [
  { label: "Ready", connected: true, dot: "#38A169", hotend: { c: 27, t: 0 }, bed: { c: 24, t: 0 }, printing: null },
  { label: "Heating", connected: true, dot: "#D69E2E", hotend: { c: 142, t: 215 }, bed: { c: 38, t: 60 }, printing: null },
  { label: "Printing", connected: true, dot: "#0098A8", hotend: { c: 215, t: 215 }, bed: { c: 60, t: 60 }, printing: { file: "bracket_v1.1.gcode", pct: 47 } },
  { label: "Offline", connected: false, dot: "#E53E3E", hotend: { c: 22, t: 0 }, bed: { c: 22, t: 0 }, printing: null },
];

const MC = { PLA: { bg: "#DBEAFE", c: "#1D4ED8" }, PETG: { bg: "#D1FAE5", c: "#065F46" }, ASA: { bg: "#FEF3C7", c: "#92400E" }, ABS: { bg: "#FCE7F3", c: "#9D174D" }, TPU: { bg: "#EDE9FE", c: "#5B21B6" }, Nylon: { bg: "#F0F9FF", c: "#0369A1" } };
const ms = (m) => MC[m] || { bg: "#F7FAFC", c: "#718096" };

const FI = { stl: "ti-box", "3mf": "ti-box", gcode: "ti-code" };
const FC = { stl: "#D97706", "3mf": "#2563EB", gcode: "#059669" };
const MATS = ["PLA", "PETG", "ASA", "ABS", "TPU", "Nylon", "PC", "PA-CF"];

let apiPromise = null;
let apiStatusTimer = null;

function getApiHandle() {
  try {
    if (window.pywebview && window.pywebview.api) return window.pywebview.api;
  } catch (error) {
  }

  try {
    if (window.parent && window.parent !== window && window.parent.pywebview && window.parent.pywebview.api) {
      return window.parent.pywebview.api;
    }
  } catch (error) {
  }

  return null;
}

function waitForApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const tryResolve = () => {
      const api = getApiHandle();
      if (api) {
        if (apiStatusTimer) {
          clearInterval(apiStatusTimer);
          apiStatusTimer = null;
        }
        resolve(api);
      }
    };

    tryResolve();
    window.addEventListener("pywebviewready", tryResolve, { once: true });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.addEventListener("pywebviewready", tryResolve, { once: true });
      }
    } catch (error) {
    }

    apiStatusTimer = setInterval(() => {
      tryResolve();
    }, 250);
  });
  return apiPromise;
}

function parseBold(s) {
  const parts = [];
  let r = s;
  let k = 0;
  while (r.includes("**")) {
    const a = r.indexOf("**"), b = r.indexOf("**", a + 2);
    if (b === -1) { parts.push(r); r = ""; break; }
    if (a > 0) parts.push(r.slice(0, a));
    parts.push(h("strong", { key: k++, style: { color: "var(--t1)" } }, r.slice(a + 2, b)));
    r = r.slice(b + 2);
  }
  if (r) parts.push(r);
  return parts.length === 0 ? "" : parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

function renderMd(md) {
  if (!md) return h("span", { style: { color: "var(--t4)", fontSize: 12 } }, "No content - click edit to start writing.");
  return md.split("\n").map((ln, i) => {
    if (ln.startsWith("# ")) return h("div", { key: i, style: { fontSize: 17, fontWeight: 700, color: "var(--t1)", marginBottom: 8, marginTop: i ? 6 : 0, lineHeight: 1.3 } }, ln.slice(2));
    if (ln.startsWith("## ")) return h("div", { key: i, style: { fontSize: 9, fontWeight: 700, color: "var(--t3)", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" } }, ln.slice(3));
    if (ln.startsWith("- ") || ln.startsWith("-- ")) return h("div", { key: i, style: { display: "flex", gap: 8, marginBottom: 3 } },
      h("span", { style: { color: "var(--t4)", flexShrink: 0, lineHeight: 1.7 } }, "-"),
      h("span", { style: { fontSize: 12, color: "var(--t2)", lineHeight: 1.7 } }, parseBold(ln.slice(2))));
    if (!ln.trim()) return h("div", { key: i, style: { height: 6 } });
    return h("div", { key: i, style: { fontSize: 12, color: "var(--t2)", lineHeight: 1.7, marginBottom: 2 } }, parseBold(ln));
  });
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function fmtSz(files) {
  const total = files.reduce((s, f) => s + (f.sizeBytes || 0), 0);
  return formatSize(total);
}

function fileTypeFromName(name) {
  if (!name) return "";
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function normalizeFile(file) {
  const name = file?.name || file?.filename || "file";
  const type = (file?.type || file?.file_type || "" || fileTypeFromName(name)).toLowerCase();
  let sizeBytes = 0;
  if (Number.isFinite(file?.size)) sizeBytes = file.size;
  if (Number.isFinite(file?.size_bytes)) sizeBytes = file.size_bytes;
  if (Number.isFinite(file?.sizeBytes)) sizeBytes = file.sizeBytes;
  const sizeText = typeof file?.size === "string" ? file.size : formatSize(sizeBytes);
  return { name, type, size: sizeText, sizeBytes };
}

function normalizeVersion(projectId, version) {
  const ver = String(version?.version ?? version?.ver ?? "1.0");
  const meta = version?.meta || {};
  const files = Array.isArray(version?.files) ? version.files.map(normalizeFile) : [];
  return {
    id: version?.id || `v-${projectId}-${ver}`,
    ver,
    label: version?.label || `Version ${ver}`,
    date: version?.creation_date || version?.date || "",
    meta: {
      material: meta.material || "",
      color: meta.color || "",
      weight: meta.weight || "",
    },
    files,
    md: version?.md || "",
  };
}

function normalizeProject(project, versions) {
  const id = project?.project_id || project?.id || `p-${project?.name || "project"}`;
  return {
    id,
    name: project?.name || "Untitled Project",
    desc: project?.description || project?.desc || "",
    created: project?.creation_date || project?.created || "",
    md: project?.md || "",
    iters: (versions || []).map((version) => normalizeVersion(id, version)),
  };
}

function mergeNotes(nextProjects, prevProjects) {
  const noteMap = new Map();
  (prevProjects || []).forEach((proj) => {
    if (proj.md) noteMap.set(`p:${proj.name}`, proj.md);
    (proj.iters || []).forEach((iter) => {
      if (iter.md) noteMap.set(`i:${proj.name}:${iter.ver}`, iter.md);
    });
  });

  return (nextProjects || []).map((proj) => ({
    ...proj,
    md: noteMap.get(`p:${proj.name}`) || proj.md || "",
    iters: (proj.iters || []).map((iter) => ({
      ...iter,
      md: noteMap.get(`i:${proj.name}:${iter.ver}`) || iter.md || "",
    })),
  }));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function App() {
  const [projs, setProjs] = useState([]);
  const [pid, setPid] = useState(null);
  const [iid, setIid] = useState(null);
  const [tab, setTab] = useState("files");
  const [editMd, setEditMd] = useState(false);
  const [selFile, setSelFile] = useState(null);
  const [ff, setFf] = useState("all");
  const [fs, setFs] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drop, setDrop] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOv, setDragOv] = useState(null);
  const [dragPid, setDragPid] = useState(null);
  const [dragPOv, setDragPOv] = useState(null);
  const [modal, setModal] = useState(null);
  const [mv, setMv] = useState("");
  const [mv2, setMv2] = useState("");
  const [ctxMenu, setCtxMenu] = useState(null);
  const [pidx, setPidx] = useState(0);
  const [sett, setSett] = useState({ name: "Voron 2.4", ip: "192.168.1.100", api: "Mainsail", path: "/Applications/OrcaSlicer.app" });
  const [profiles, setProfiles] = useState([
    { id: "pp1", name: "Draft 0.3mm", lh: "0.30", infill: "15", sup: "None", spd: "Draft", mat: "PLA", notes: "Quick test prints" },
    { id: "pp2", name: "Standard 0.2mm", lh: "0.20", infill: "20", sup: "None", spd: "Normal", mat: "PETG", notes: "Everyday functional parts" },
    { id: "pp3", name: "Quality 0.15mm", lh: "0.15", infill: "30", sup: "Tree", spd: "Normal", mat: "PETG", notes: "Structural parts" },
    { id: "pp4", name: "Detail 0.1mm", lh: "0.10", infill: "40", sup: "Tree", spd: "Quality", mat: "PETG", notes: "Fine detail work" },
  ]);
  const [selPro, setSelPro] = useState("pp2");
  const [mdata, setMdata] = useState({});
  const [toast, setToast] = useState(null);
  const tt = useRef();
  const pidRef = useRef(pid);
  const iidRef = useRef(iid);
  const projsRef = useRef(projs);
  const editRef = useRef(editMd);

  useEffect(() => { pidRef.current = pid; }, [pid]);
  useEffect(() => { iidRef.current = iid; }, [iid]);
  useEffect(() => { projsRef.current = projs; }, [projs]);
  useEffect(() => { editRef.current = editMd; }, [editMd]);

  const notify = (m) => {
    clearTimeout(tt.current);
    setToast(m);
    tt.current = setTimeout(() => setToast(null), 3000);
  };

  const refreshProjects = async (keepSelection, focusName) => {
    try {
      const api = await waitForApi();
      const list = await api.LIST_PROJECTS();
      const projects = Array.isArray(list) ? list : [];
      const loaded = [];
      for (const proj of projects) {
        let versions = [];
        try {
          const result = await api.LIST_PROJECT_VERSIONS(proj.name);
          versions = Array.isArray(result) ? result : [];
        } catch (error) {
          versions = [];
        }
        loaded.push(normalizeProject(proj, versions));
      }

      const merged = mergeNotes(loaded, projsRef.current);
      let nextPid = null;
      if (focusName) {
        const focus = merged.find((p) => p.name === focusName);
        nextPid = focus ? focus.id : null;
      }
      if (!nextPid) {
        nextPid = keepSelection && pidRef.current && merged.some((p) => p.id === pidRef.current)
          ? pidRef.current
          : (merged[0]?.id || null);
      }
      let nextIid = null;
      if (keepSelection && iidRef.current && nextPid) {
        const p = merged.find((proj) => proj.id === nextPid);
        if (p && p.iters.some((it) => it.id === iidRef.current)) {
          nextIid = iidRef.current;
        }
      }

      setProjs(merged);
      setPid(nextPid);
      setIid(nextIid);
      setSelFile(null);
    } catch (error) {
      notify("Failed to load projects");
    }
  };

  useEffect(() => {
    refreshProjects(false);
    const interval = setInterval(() => {
      if (!editRef.current) {
        refreshProjects(true);
      }
    }, 20000);
    const onFocus = () => {
      if (!editRef.current) {
        refreshProjects(true);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (editMd) return;
    const project = projsRef.current.find((p) => p.id === pidRef.current);
    if (!project) return;
    const version = iidRef.current ? project.iters.find((it) => it.id === iidRef.current) : null;
    const loadNotes = async () => {
      try {
        const api = await waitForApi();
        const content = version
          ? await api.GET_PROJECT_VERSION_NOTES(project.name, version.ver)
          : await api.GET_PROJECT_NOTES(project.name);
        setProjs((prev) => prev.map((p) => {
          if (p.id !== project.id) return p;
          if (version) {
            return {
              ...p,
              iters: p.iters.map((it) => it.id === version.id ? { ...it, md: content || "" } : it),
            };
          }
          return { ...p, md: content || "" };
        }));
      } catch (error) {
        notify("Failed to load notes");
      }
    };
    loadNotes();
  }, [pid, iid, editMd]);

  const selP = projs.find((p) => p.id === pid) || null;
  const selI = iid ? selP?.iters.find((i) => i.id === iid) || null : null;
  const curMd = selI ? selI.md : (selP?.md || "");
  const mdPath = selP ? `${selP.name.replace(/\s+/g, "-")}/${selI ? "Iteration.md" : "Project.md"}` : "";
  const printer = PS[pidx];
  const totalI = projs.reduce((s, p) => s + p.iters.length, 0);
  const totalF = projs.reduce((s, p) => s + p.iters.reduce((s2, i) => s2 + i.files.length, 0), 0);
  const sq = search.toLowerCase().trim();
  const dispP = sq ? projs.filter((p) => p.name.toLowerCase().includes(sq) || p.iters.some((i) => i.label.toLowerCase().includes(sq))) : projs;
  const avTypes = (() => {
    if (!selP) return [];
    const files = selI ? selI.files : selP.iters.flatMap((i) => i.files);
    const ts = new Set(files.map((f) => f.type));
    return ["stl", "3mf", "gcode"].filter((t) => ts.has(t));
  })();
  const filtF = (files) => {
    let f = files;
    if (ff !== "all") f = f.filter((fi) => fi.type === ff);
    if (fs.trim()) f = f.filter((fi) => fi.name.toLowerCase().includes(fs.toLowerCase()));
    return f;
  };

  const updateMd = (value) => {
    if (selI) {
      setProjs((p) => p.map((proj) => ({
        ...proj,
        iters: proj.iters.map((it) => it.id === iid ? { ...it, md: value } : it),
      })));
    } else if (selP) {
      setProjs((p) => p.map((proj) => proj.id === pid ? { ...proj, md: value } : proj));
    }
  };

  const persistMd = async () => {
    if (!selP) return;
    try {
      const api = await waitForApi();
      if (selI) {
        await api.SET_PROJECT_VERSION_NOTES(selP.name, selI.ver, curMd || "");
      } else {
        await api.SET_PROJECT_NOTES(selP.name, curMd || "");
      }
      notify("Notes saved");
    } catch (error) {
      notify("Failed to save notes");
    }
  };

  const navP = (p) => {
    if (editMd) persistMd();
    setPid(p.id);
    setIid(null);
    setEditMd(false);
    setSelFile(null);
    setCtxMenu(null);
    setFf("all");
    setFs("");
  };

  const navI = (pId, it) => {
    if (editMd) persistMd();
    setPid(pId);
    setIid(it.id);
    setEditMd(false);
    setSelFile(null);
    setCtxMenu(null);
    setFf("all");
    setFs("");
  };

  const uploadFiles = async (projectName, version, files) => {
    if (!files || !files.length) return;
    const api = await waitForApi();
    for (const file of files) {
      const dataUrl = await fileToBase64(file);
      await api.ADD_PROJECT_VERSION_FILE_DATA(projectName, version, file.name, dataUrl);
    }
  };

  const extDrop = async (ev, tPid, tIid) => {
    ev.preventDefault();
    setDrop(null);
    const files = Array.from(ev.dataTransfer.files || []);
    if (!files.length) return;
    const proj = projs.find((p) => p.id === tPid);
    if (!proj) return;

    if (tIid) {
      const iter = proj.iters.find((it) => it.id === tIid);
      if (!iter) return;
      try {
        await uploadFiles(proj.name, iter.ver, files);
        await refreshProjects(true);
        notify(`${files.length} file${files.length !== 1 ? "s" : ""} added`);
      } catch (error) {
        notify("Failed to upload files");
      }
    } else {
      setModal({ type: "newIter", pid: tPid, files });
      setMv("");
    }
  };

  const reorderI = (from, to, pj) => {
    if (from === to) return;
    setProjs((p) => p.map((proj) => {
      if (proj.id !== pj) return proj;
      const a = [...proj.iters], fi = a.findIndex((i) => i.id === from), ti = a.findIndex((i) => i.id === to);
      const [m] = a.splice(fi, 1); a.splice(ti, 0, m); return { ...proj, iters: a };
    }));
    notify("Reordered");
  };

  const reorderP = (from, to) => {
    if (from === to) return;
    setProjs((p) => { const a = [...p], fi = a.findIndex((proj) => proj.id === from), ti = a.findIndex((proj) => proj.id === to); const [m] = a.splice(fi, 1); a.splice(ti, 0, m); return a; });
    notify("Projects reordered");
  };

  const createProj = async () => {
    if (!mv.trim()) return;
    const n = mv.trim(), d = mv2.trim();
    try {
      const api = await waitForApi();
      await api.ADD_PROJECT(n);
      if (d) {
        await api.UPDATE_PROJECT(n, n, { description: d });
      }
      await refreshProjects(false, n);
      setIid(null);
      setModal(null);
      notify(`"${n}" created`);
    } catch (error) {
      notify("Failed to create project");
    }
  };

  const createIter = async () => {
    if (!mv.trim()) return;
    const proj = projs.find((p) => p.id === modal.pid);
    if (!proj) return;
    const vs = proj.iters.map((i) => parseFloat(i.ver)).filter((v) => !Number.isNaN(v));
    const nv = (vs.length ? Math.floor(Math.max(...vs)) + 1 : 1).toFixed(1);
    const ts = new Date().toISOString().slice(0, 10);
    const files = modal.files || [];
    try {
      const api = await waitForApi();
      await api.CREATE_PROJECT_VERSION(proj.name, nv, mv.trim(), { material: "PLA", color: "", weight: "" });
      if (files.length) {
        await uploadFiles(proj.name, nv, files);
      }
      await refreshProjects(true, proj.name);
      setPid(proj.id);
      setIid(`v-${proj.id}-${nv}`);
      setModal(null);
      notify(`v${nv} "${mv.trim()}" created`);
    } catch (error) {
      notify("Failed to create version");
    }
  };

  const doRename = async () => {
    if (!mv.trim()) return;
    try {
      const api = await waitForApi();
      if (modal.what === "proj") {
        await api.UPDATE_PROJECT(modal.name, mv.trim(), { description: mv2.trim() });
      } else {
        await api.UPDATE_PROJECT_VERSION(modal.pid, modal.ver, { label: mv.trim() });
      }
      await refreshProjects(true, modal.what === "proj" ? mv.trim() : null);
      notify("Renamed");
      setModal(null);
    } catch (error) {
      notify("Failed to rename");
    }
  };

  const doDelete = async () => {
    try {
      const api = await waitForApi();
      if (modal.what === "proj") {
        await api.REMOVE_PROJECT(modal.name, false);
      } else {
        await api.REMOVE_PROJECT_VERSION(modal.pid, modal.ver, true);
      }
      await refreshProjects(false);
      setModal(null);
      notify("Deleted");
    } catch (error) {
      notify("Failed to delete");
    }
  };

  const dupI = async (pjId, it) => {
    const proj = projs.find((p) => p.id === pjId);
    if (!proj) return;
    const vs = proj.iters.map((i) => parseFloat(i.ver)).filter((v) => !Number.isNaN(v));
    const nv = (Math.max(...vs) + 0.1).toFixed(1);
    try {
      const api = await waitForApi();
      await api.CREATE_PROJECT_VERSION(proj.name, nv, `${it.label} (copy)`, { ...it.meta });
      await refreshProjects(true);
      notify(`Duplicated as v${nv}`);
    } catch (error) {
      notify("Failed to duplicate");
    }
  };

  const removeFile = async (itId, fname) => {
    const proj = projs.find((p) => p.id === pid);
    if (!proj) return;
    const it = proj.iters.find((iter) => iter.id === itId);
    if (!it) return;
    try {
      const api = await waitForApi();
      await api.REMOVE_PROJECT_VERSION_FILE(proj.name, it.ver, fname);
      await refreshProjects(true);
      if (selFile && selFile.name === fname) setSelFile(null);
      setCtxMenu(null);
      notify(`${fname} removed`);
    } catch (error) {
      notify("Failed to remove file");
    }
  };

  const openNewProfile = () => { setMdata({ name: "", lh: "0.20", infill: "20", sup: "None", spd: "Normal", mat: "PETG", notes: "" }); setModal({ type: "profile", editId: null }); };
  const openEditProfile = (pro) => { setMdata({ ...pro }); setModal({ type: "profile", editId: pro.id }); };
  const saveProfile = () => {
    if (!mdata.name || !mdata.name.trim()) return;
    if (modal.editId) {
      setProfiles((p) => p.map((pr) => pr.id === modal.editId ? { ...pr, ...mdata } : pr));
      notify("Profile updated");
    } else {
      const np = { ...mdata, id: `pp${Date.now()}` };
      setProfiles((p) => [...p, np]);
      setSelPro(np.id);
      notify(`"${np.name}" profile saved`);
    }
    setModal(null);
  };
  const deleteProfile = (id) => {
    setProfiles((p) => p.filter((pr) => pr.id !== id));
    if (selPro === id) {
      const rem = profiles.filter((pr) => pr.id !== id);
      setSelPro(rem.length ? rem[0].id : null);
    }
    notify("Profile deleted");
  };

  const openCtx = (e, payload) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, ...payload });
  };

  const openPrint = () => {
    if (!selFile || !selI || !selP) return;
    setModal({ type: "print", file: selFile, ver: selI.ver, label: selI.label, proj: selP.name });
  };

  const cib = (icon, cls, tip, fn) => h("button", { className: `cib${cls ? " " + cls : ""}`, title: tip, "aria-label": tip, onClick: (e) => { e.stopPropagation(); fn(); }, onDragStart: (e) => e.stopPropagation() },
    h("i", { className: `ti ${icon}`, "aria-hidden": "true" }));

  const DR = (label, val, editable, onCh, custom) => h("div", { className: "det-row" },
    h("span", { className: "det-key" }, label),
    custom || (editable
      ? h("input", { className: "det-inp", value: val, onChange: (e) => onCh(e.target.value), style: { flex: 1 } })
      : h("span", { style: { fontSize: 12, color: "var(--t1)", flex: 1 } }, val)));

  const FT = (() => {
    if (!selP) return h("div", { className: "empty" }, h("i", { className: "ti ti-folder", "aria-hidden": "true", style: { fontSize: 36, color: "var(--t4)" } }), h("span", { style: { fontSize: 13 } }, "Select a project"));
    if (selI) {
      const files = filtF(selI.files);
      if (!selI.files.length) return h("div", { className: "empty" },
        h("i", { className: "ti ti-file-off", "aria-hidden": "true", style: { fontSize: 32, color: "var(--t4)" } }),
        h("span", { style: { fontSize: 12 } }, "No files yet"),
        h("span", { style: { fontSize: 11 } }, "Drop files onto this iteration card to attach them."));
      if (!files.length) return h("div", { style: { padding: "16px", fontSize: 12, color: "var(--t4)" } }, "No files match this filter.");
      return h(React.Fragment, null, ...files.map((f, i) => h("div", { key: i, className: `ft-r${selFile && selFile.name === f.name ? " fsel" : ""}`,
        onClick: () => setSelFile(selFile && selFile.name === f.name ? null : f),
        onContextMenu: (e) => openCtx(e, { kind: "file", file: f, itId: selI.id }) },
        h("i", { className: `ti ${FI[f.type] || "ti-file"}`, "aria-hidden": "true", style: { fontSize: 13, color: FC[f.type] || "var(--t4)", flexShrink: 0 } }),
        h("span", { style: { fontSize: 11, color: "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name),
        h("span", { style: { fontSize: 10, color: "var(--t4)", flexShrink: 0, marginLeft: 6 } }, f.size))));
    }
    if (!selP.iters.length) return h("div", { className: "empty" },
      h("i", { className: "ti ti-versions", "aria-hidden": "true", style: { fontSize: 32, color: "var(--t4)" } }),
      h("span", { style: { fontSize: 12 } }, "No iterations yet"),
      h("button", { className: "btn-s", style: { marginTop: 4 }, onClick: () => { setModal({ type: "newIter", pid: pid, files: [] }); setMv(""); } },
        h("i", { className: "ti ti-plus", "aria-hidden": "true", style: { fontSize: 12 } }), "Create first iteration"));
    return h(React.Fragment, null, ...selP.iters.flatMap((it) => [
      h("div", { key: `d${it.id}`, className: `ft-r${iid === it.id ? " isel" : ""}`, onClick: () => navI(selP.id, it) },
        h("i", { className: `ti ${iid === it.id ? "ti-folder-open" : "ti-folder"}`, "aria-hidden": "true", style: { fontSize: 13, color: iid === it.id ? "var(--acc)" : "var(--t4)", flexShrink: 0 } }),
        h("span", { style: { fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: iid === it.id ? "var(--acc)" : "var(--t3)", flexShrink: 0, marginRight: 6 } }, `v${it.ver}`),
        h("span", { style: { fontSize: 11, color: iid === it.id ? "var(--accT)" : "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.label),
        h("span", { style: { fontSize: 9, color: "var(--t4)", flexShrink: 0 } }, `${it.files.length} f`)),
      ...filtF(it.files).map((f, fi) => h("div", { key: `df${it.id}${fi}`,
        className: `ft-r${selFile && selFile.name === f.name ? " fsel" : ""}`, style: { paddingLeft: 28 },
        onClick: () => { navI(selP.id, it); setSelFile(selFile && selFile.name === f.name ? null : f); },
        onContextMenu: (e) => openCtx(e, { kind: "file", file: f, itId: it.id }) },
        h("i", { className: `ti ${FI[f.type] || "ti-file"}`, "aria-hidden": "true", style: { fontSize: 12, color: FC[f.type] || "var(--t4)", flexShrink: 0 } }),
        h("span", { style: { fontSize: 11, color: "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name),
        h("span", { style: { fontSize: 10, color: "var(--t4)", flexShrink: 0, marginLeft: 6 } }, f.size)))
    ]));
  })();

  const DET = h("div", { style: { flex: 1, overflowY: "auto", padding: "16px 18px" } },
    selI ? h(React.Fragment, null,
      h("div", { style: { marginBottom: 20 } },
        h("span", { className: "det-sec-l" }, "Iteration"),
        DR("Version", `v${selI.ver}`),
        DR("Label", selI.label),
        DR("Created", selI.date),
        DR("Files", `${selI.files.length} file${selI.files.length !== 1 ? "s" : ""}${selI.files.length ? ` - ${fmtSz(selI.files)}` : ""}`)),
      h("div", null)
    ) : selP ? h(React.Fragment, null,
      h("div", { style: { marginBottom: 20 } },
        h("span", { className: "det-sec-l" }, "Project"),
        DR("Name", selP.name),
        DR("Description", selP.desc || "-"),
        DR("Created", selP.created),
        DR("Iterations", `${selP.iters.length} iteration${selP.iters.length !== 1 ? "s" : ""}`),
        DR("Files", `${selP.iters.reduce((s, i) => s + i.files.length, 0)} files total`)),
      selP.iters.length > 0 && h("div", null,
        h("span", { className: "det-sec-l" }, "All iterations"),
        selP.iters.map((it) => {
          const { bg, c } = ms(it.meta.material);
          return h("div", { key: it.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--bdr)", cursor: "pointer" }, onClick: () => navI(selP.id, it) },
            h("span", { style: { fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "var(--acc)", flexShrink: 0, minWidth: 30 } }, `v${it.ver}`),
            h("span", { style: { fontSize: 11, color: "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.label),
            h("span", { className: "mat-pill", style: { background: bg, color: c, flexShrink: 0 } }, it.meta.material || ""));
        })
      )
    ) : h("div", { className: "empty" },
      h("i", { className: "ti ti-layout-list", "aria-hidden": "true", style: { fontSize: 32, color: "var(--t4)" } }),
      h("span", { style: { fontSize: 12 } }, "Nothing selected"))
  );

  const MICONS = { newProj: "ti-folder-plus", newIter: "ti-plus", rename: "ti-pencil", confirm: "ti-trash", settings: "ti-settings", print: "ti-printer", profile: modal?.editId ? "ti-adjustments-horizontal" : "ti-adjustments-horizontal" };
  const MTITLES = { newProj: "New Project", newIter: "New iteration", rename: "Rename", confirm: "Confirm delete", settings: "Settings", print: "Send to printer", profile: modal?.editId ? "Edit print profile" : "New print profile" };

  const ProCard = ({ pro }) => {
    const isSel = selPro === pro.id;
    return h("div", { className: `pro-card${isSel ? " pro-sel" : ""}`, onClick: () => setSelPro(pro.id) },
      h("div", { className: "pro-card-acts" },
        h("button", { className: "cib", title: "Edit", onClick: (e) => { e.stopPropagation(); openEditProfile(pro); } }, h("i", { className: "ti ti-pencil", "aria-hidden": "true" })),
        h("button", { className: "cib del", title: "Delete", onClick: (e) => { e.stopPropagation(); deleteProfile(pro.id); } }, h("i", { className: "ti ti-trash", "aria-hidden": "true" }))),
      h("div", { style: { fontSize: 11, fontWeight: 700, color: isSel ? "var(--accT)" : "var(--t1)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, pro.name),
      h("div", { style: { fontSize: 10, color: isSel ? "var(--accT)" : "var(--t3)", lineHeight: 1.5 } }, `${pro.lh}mm - ${pro.mat}`),
      h("div", { style: { fontSize: 10, color: isSel ? "var(--accT)" : "var(--t4)", lineHeight: 1.5 } }, `${pro.infill}% - ${pro.sup}`),
      h("div", { style: { fontSize: 10, color: isSel ? "var(--accT)" : "var(--t4)", lineHeight: 1.5 } }, `${pro.spd} speed`));
  };

  const Modal = modal && h("div", { className: "overlay", onClick: (e) => { if (e.target === e.currentTarget) setModal(null); } },
    h("div", { className: modal.type === "print" || modal.type === "profile" ? "mbox-wide" : "mbox" },
      h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } },
        h("i", { className: `ti ${MICONS[modal.type]}`, "aria-hidden": "true", style: { fontSize: 22, color: "var(--t3)" } }),
        h("span", { style: { fontSize: 16, fontWeight: 700, color: "var(--t1)" } }, MTITLES[modal.type])),

      modal.type === "newProj" && h("div", null,
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Project name"), h("input", { value: mv, autoFocus: true, placeholder: "e.g. Fan duct assembly", onChange: (e) => setMv(e.target.value), onKeyDown: (e) => e.key === "Enter" && createProj() })),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Description (optional)"), h("input", { value: mv2, placeholder: "Short description...", onChange: (e) => setMv2(e.target.value), onKeyDown: (e) => e.key === "Enter" && createProj() }))),

      modal.type === "newIter" && h("div", null,
        modal.files && modal.files.length > 0 && h("div", { className: "mfield" },
          h("span", { className: "ml" }, `${modal.files.length} file${modal.files.length !== 1 ? "s" : ""} queued`),
          modal.files.map((f, i) => h("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--bdr)" } },
            h("i", { className: `ti ${FI[fileTypeFromName(f.name)] || "ti-file"}`, "aria-hidden": "true", style: { fontSize: 12, color: FC[fileTypeFromName(f.name)] || "var(--t4)" } }),
            h("span", { style: { fontSize: 11, color: "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name),
            h("span", { style: { fontSize: 10, color: "var(--t4)" } }, formatSize(f.size)))))),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Iteration name"), h("input", { value: mv, autoFocus: true, placeholder: "e.g. Wide flange variant", onChange: (e) => setMv(e.target.value), onKeyDown: (e) => e.key === "Enter" && createIter() }))),

      modal.type === "rename" && h("div", null,
        h("div", { className: "mfield" }, h("label", { className: "ml" }, modal.what === "proj" ? "Project name" : "Iteration name"), h("input", { value: mv, autoFocus: true, onChange: (e) => setMv(e.target.value), onKeyDown: (e) => e.key === "Enter" && doRename() })),
        modal.what === "proj" && h("div", { className: "mfield" }, h("label", { className: "ml" }, "Description"), h("input", { value: mv2, placeholder: "Short description...", onChange: (e) => setMv2(e.target.value) }))),

      modal.type === "confirm" && h("div", { style: { marginBottom: 4 } },
        h("div", { style: { fontSize: 14, color: "var(--t1)", marginBottom: 8, lineHeight: 1.5 } }, "Delete ", h("strong", null, modal.name), "?"),
        h("div", { style: { fontSize: 12, color: "var(--t3)" } }, "This cannot be undone.", modal.what === "proj" ? " All iterations will also be removed." : "")),

      modal.type === "settings" && h("div", null,
        h("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--t3)", textTransform: "uppercase", display: "block", marginBottom: 14 } }, "Printer"),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Printer name"), h("input", { value: sett.name, onChange: (e) => setSett((s) => ({ ...s, name: e.target.value })) })),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "IP address"), h("input", { value: sett.ip, onChange: (e) => setSett((s) => ({ ...s, ip: e.target.value })) })),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "API type"), h("select", { value: sett.api, onChange: (e) => setSett((s) => ({ ...s, api: e.target.value })) }, h("option", null, "Mainsail"), h("option", null, "Fluidd"))),
        h("div", { style: { marginBottom: 20 } }, h("button", { className: "btn-s", style: { fontSize: 11 }, onClick: () => { setPidx(0); notify(`Connected to ${sett.name}`); } }, h("i", { className: "ti ti-plug", "aria-hidden": "true", style: { fontSize: 13 } }), "Test connection")),
        h("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--t3)", textTransform: "uppercase", display: "block", marginBottom: 14 } }, "OrcaSlicer"),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "App path"), h("input", { value: sett.path, onChange: (e) => setSett((s) => ({ ...s, path: e.target.value })) }))),

      modal.type === "print" && h("div", null,
        h("div", { className: "pblock" },
          [["File", modal.file.name], ["Type", `${modal.file.type.toUpperCase()} - ${modal.file.size}`], ["Project", modal.proj], ["Version", `v${modal.ver} - ${modal.label}`]].map(([k, v]) =>
            h("div", { key: k, style: { display: "flex", gap: 10, fontSize: 12, marginBottom: 5 } },
              h("span", { style: { color: "var(--t3)", fontWeight: 600, width: 54, flexShrink: 0, fontSize: 10, textTransform: "uppercase" } }, k),
              h("span", { style: { color: "var(--t1)" } }, v)))),
        h("div", { style: { marginBottom: 14 } },
          h("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } },
            h("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--t3)", textTransform: "uppercase" } }, "Print Profile"),
            h("div", { style: { flex: 1, height: 1, background: "var(--bdr)" } }),
            h("button", { className: "btn-s", style: { fontSize: 10, padding: "3px 9px" }, onClick: openNewProfile },
              h("i", { className: "ti ti-plus", "aria-hidden": "true", style: { fontSize: 11 } }), "New")),
          profiles.length === 0 ? h("div", { style: { fontSize: 12, color: "var(--t4)", padding: "10px 0" } }, "No profiles yet - click New to create one.")
            : h("div", { className: "pro-grid" }, ...profiles.map((pro) => h(ProCard, { key: pro.id, pro })))),
        (() => {
          const pro = profiles.find((p) => p.id === selPro);
          if (!pro) return null;
          return h("div", { style: { background: "var(--accL)", border: "1px solid var(--acc)", borderRadius: 7, padding: "8px 12px", marginBottom: 14, fontSize: 11 } },
            h("div", { style: { fontWeight: 700, color: "var(--accT)", marginBottom: 2 } }, pro.name),
            h("div", { style: { color: "var(--accT)", opacity: .85 } }, `${pro.lh}mm layers - ${pro.infill}% infill - ${pro.sup} supports - ${pro.spd} speed - ${pro.mat}`),
            pro.notes && h("div", { style: { color: "var(--accT)", opacity: .7, marginTop: 2 } }, pro.notes));
        })(),
        h("div", { className: "pblock" },
          [["Printer", sett.name], ["Address", `${sett.ip} - ${sett.api}`], ["State", printer.connected ? printer.label : "Offline"]].map(([k, v]) =>
            h("div", { key: k, style: { display: "flex", gap: 10, fontSize: 12, marginBottom: 5 } },
              h("span", { style: { color: "var(--t3)", fontWeight: 600, width: 54, flexShrink: 0, fontSize: 10, textTransform: "uppercase" } }, k),
              h("span", { style: { color: k === "State" && printer.connected ? "var(--grn)" : "var(--t1)" } }, v)))),

      modal.type === "profile" && h("div", null,
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Profile name"),
          h("input", { value: mdata.name || "", autoFocus: true, placeholder: "e.g. PETG Structural 0.2mm", onChange: (e) => setMdata((d) => ({ ...d, name: e.target.value })) })),
        h("div", { className: "grid2" },
          h("div", { className: "mfield" }, h("label", { className: "ml" }, "Layer height (mm)"),
            h("input", { value: mdata.lh || "", placeholder: "0.20", onChange: (e) => setMdata((d) => ({ ...d, lh: e.target.value })) })),
          h("div", { className: "mfield" }, h("label", { className: "ml" }, "Infill (%)"),
            h("input", { value: mdata.infill || "", placeholder: "20", onChange: (e) => setMdata((d) => ({ ...d, infill: e.target.value })) }))),
        h("div", { className: "grid2" },
          h("div", { className: "mfield" }, h("label", { className: "ml" }, "Supports"),
            h("select", { value: mdata.sup || "None", onChange: (e) => setMdata((d) => ({ ...d, sup: e.target.value })) },
              ["None", "Normal", "Tree", "Organic"].map((s) => h("option", { key: s }, s)))),
          h("div", { className: "mfield" }, h("label", { className: "ml" }, "Speed"),
            h("select", { value: mdata.spd || "Normal", onChange: (e) => setMdata((d) => ({ ...d, spd: e.target.value })) },
              ["Draft", "Normal", "Quality", "Silent"].map((s) => h("option", { key: s }, s))))),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Material"),
          h("select", { value: mdata.mat || "PETG", onChange: (e) => setMdata((d) => ({ ...d, mat: e.target.value })) },
            MATS.map((m) => h("option", { key: m }, m)))),
        h("div", { className: "mfield" }, h("label", { className: "ml" }, "Notes (optional)"),
          h("input", { value: mdata.notes || "", placeholder: "Describe when to use this profile...", onChange: (e) => setMdata((d) => ({ ...d, notes: e.target.value })) }))),

      h("div", { className: "mbtns" },
        h("button", { className: "btn-s", onClick: () => setModal(null) }, modal.type === "settings" ? "Close" : "Cancel"),
        modal.type === "newProj" && h("button", { className: "btn-p", disabled: !mv.trim(), onClick: createProj }, "Create project"),
        modal.type === "newIter" && h("button", { className: "btn-p", disabled: !mv.trim(), onClick: createIter }, "Create iteration"),
        modal.type === "rename" && h("button", { className: "btn-p", disabled: !mv.trim(), onClick: doRename }, "Save"),
        modal.type === "confirm" && h("button", { className: "btn-danger", onClick: doDelete }, "Delete"),
        modal.type === "profile" && h("button", { className: "btn-p", disabled: !(mdata.name && mdata.name.trim()), onClick: saveProfile }, "Save profile"),
        modal.type === "print" && modal.file.type === "gcode" && h("button", { className: "btn-s", style: { color: "var(--grn)", borderColor: "var(--grn)" },
          onClick: () => { const pro = profiles.find((p) => p.id === selPro); setModal(null); notify(`Sending to Klipper${pro ? ` with \"${pro.name}\" profile` : ""} (stub)...`); } },
          h("i", { className: "ti ti-send", "aria-hidden": "true", style: { fontSize: 12 } }), " Klipper"),
        modal.type === "print" && h("button", { className: "btn-p", onClick: () => { const pro = profiles.find((p) => p.id === selPro); setModal(null); notify(`Opening in OrcaSlicer${pro ? ` - ${pro.name}` : ""} (stub)...`); } },
          h("i", { className: "ti ti-external-link", "aria-hidden": "true", style: { fontSize: 12 } }), " OrcaSlicer"))));

  return h("div", { style: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }, onClick: () => setCtxMenu(null) },
    h("div", { className: "topbar" },
      h("div", { className: "header-stats" },
        h("span", null, "PROJECTS ", h("strong", null, projs.length)),
        h("span", null, "ITERATIONS ", h("strong", null, totalI)),
        h("span", null, "FILES ", h("strong", null, totalF))),
      h("div", { className: "header-actions" },
        searchOpen ? h(React.Fragment, null,
          h("div", { className: "srch", style: { minWidth: 240 } },
            h("i", { className: "ti ti-search", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t4)" } }),
            h("input", { autoFocus: true, value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search projects and iterations..." })),
          h("button", { className: "cib", onClick: () => { setSearchOpen(false); setSearch(""); } }, h("i", { className: "ti ti-x", "aria-hidden": "true" })))
        : h(React.Fragment, null,
          h("button", { className: "cib", title: "Search", onClick: () => setSearchOpen(true) }, h("i", { className: "ti ti-search", "aria-hidden": "true" })),
          h("button", { className: "btn-p", onClick: () => { setMv(""); setMv2(""); setModal({ type: "newProj" }); } }, h("i", { className: "ti ti-plus", "aria-hidden": "true", style: { fontSize: 13 } }), "New Project")))),

    h("div", { className: "body" },
      h("div", { className: "left" },
        h("div", { className: "sh" }, h("span", { className: "sh-l" }, "Projects"), h("div", { className: "sh-line" })),

        dispP.length === 0 && h("div", { className: "empty", style: { marginTop: 40 } },
          h("i", { className: "ti ti-folder-off", "aria-hidden": "true", style: { fontSize: 40, color: "var(--t4)" } }),
          h("span", { style: { fontSize: 14, color: "var(--t3)", fontWeight: 500 } }, search ? `No results for "${search}".` : "No projects yet."),
          !search && h("button", { className: "btn-p", style: { marginTop: 4 }, onClick: () => { setMv(""); setMv2(""); setModal({ type: "newProj" }); } }, h("i", { className: "ti ti-plus", "aria-hidden": "true", style: { fontSize: 14 } }), "Create first project")),

        dispP.map((proj) => {
          const isSel = proj.id === pid;
          return h("div", { key: proj.id, style: { marginBottom: 14 },
            onDragOver: (e) => { if (dragPid && dragPid !== proj.id) { e.preventDefault(); setDragPOv(proj.id); } },
            onDragLeave: () => setDragPOv(null),
            onDrop: (e) => { if (dragPid && dragPid !== proj.id) { e.preventDefault(); reorderP(dragPid, proj.id); } setDragPid(null); setDragPOv(null); },
            style: { borderTop: dragPOv === proj.id ? "2px solid var(--acc)" : "2px solid transparent", borderRadius: 10, transition: "border-color .1s" } },

            h("div", { style: { display: "flex", alignItems: "center", gap: 7, overflowX: "auto", paddingBottom: 4 } },
              h("div", { className: `card${isSel && !iid ? " sel" : ""}${drop === `p${proj.id}` ? " over" : ""}`, draggable: true,
                style: { width: 142, height: 84, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 },
                title: "Click to view - Drag to reorder", onClick: () => navP(proj),
                onDragStart: (e) => { e.dataTransfer.effectAllowed = "move"; setDragPid(proj.id); },
                onDragEnd: () => { setDragPid(null); setDragPOv(null); },
                onDragOver: (e) => { if (!dragPid && !dragId) { e.preventDefault(); setDrop(`p${proj.id}`); } },
                onDragLeave: () => setDrop(null),
                onDrop: (e) => { if (!dragPid && !dragId) extDrop(e, proj.id, null); setDrop(null); } },
                h("span", { className: "cbadge" }, proj.iters.length),
                h("div", { style: { fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: isSel && !iid ? "var(--accT)" : "var(--t1)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", paddingRight: 28 } }, proj.name),
                h("div", { style: { fontSize: 10, color: isSel && !iid ? "var(--accT)" : "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 } }, proj.desc),
                h("div", { className: "card-acts", onDragStart: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation() },
                  cib("ti-pencil", "", "Rename", () => { setMv(proj.name); setMv2(proj.desc || ""); setModal({ type: "rename", what: "proj", name: proj.name }); }),
                  cib("ti-trash", "del", "Delete", () => setModal({ type: "confirm", what: "proj", name: proj.name })))),

              h("span", { style: { color: "var(--t4)", fontSize: 13, flexShrink: 0, paddingBottom: 2 } }, ">"),

              ...proj.iters.map((it) => {
                const thisSel = it.id === iid && isSel;
                const isOver = (dragOv === it.id && dragId !== it.id) || (drop === `i${it.id}`);
                return h("div", { key: it.id, className: `card ctr grab${thisSel ? " sel" : ""}${isOver ? " over" : ""}${dragId === it.id ? " dim" : ""}`, draggable: true, style: { width: 94, height: 84 },
                  title: "Click - Right-click for more - Drag to reorder",
                  onClick: () => navI(proj.id, it), onContextMenu: (e) => openCtx(e, { kind: "iter", it, projId: proj.id }),
                  onDragStart: (e) => { e.dataTransfer.effectAllowed = "move"; setDragId(it.id); setPid(proj.id); },
                  onDragEnd: () => { setDragId(null); setDragOv(null); setDrop(null); },
                  onDragOver: (e) => { e.preventDefault(); dragId ? setDragOv(it.id) : setDrop(`i${it.id}`); },
                  onDragLeave: () => { setDragOv(null); setDrop(null); },
                  onDrop: (e) => { e.preventDefault(); if (dragId) { const sp = projs.find((p) => p.iters.some((i) => i.id === dragId)); if (sp && sp.id === proj.id) reorderI(dragId, it.id, proj.id); } else if (!dragPid) extDrop(e, proj.id, it.id); setDrop(null); } },
                  h("div", { style: { fontFamily: "monospace", fontSize: 18, fontWeight: 800, lineHeight: 1, color: thisSel ? "var(--accT)" : "var(--t1)", letterSpacing: "-.02em" } }, `v${it.ver}`),
                  h("div", { style: { fontSize: 9, lineHeight: 1.3, color: thisSel ? "var(--accT)" : "var(--t3)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", width: "100%", fontWeight: 500 } }, it.label),
                  h("div", { className: "card-acts", onDragStart: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation() },
                    cib("ti-pencil", "", "Rename", () => { setMv(it.label); setModal({ type: "rename", what: "iter", pid: proj.name, ver: it.ver }); }),
                    cib("ti-trash", "del", "Delete", () => setModal({ type: "confirm", what: "iter", pid: proj.name, ver: it.ver, name: it.label }))));
              }),

              h("div", { className: `newcard${drop === `n${proj.id}` ? " over" : ""}`, style: { width: 56, height: 84 },
                onClick: () => { setPid(proj.id); setModal({ type: "newIter", pid: proj.id, files: [] }); setMv(""); },
                onDragOver: (e) => { if (!dragPid && !dragId) { e.preventDefault(); setDrop(`n${proj.id}`); } },
                onDragLeave: () => setDrop(null),
                onDrop: (e) => { if (!dragPid && !dragId) extDrop(e, proj.id, null); setDrop(null); } },
                h("i", { className: "ti ti-plus", "aria-hidden": "true", style: { fontSize: 20, color: drop === `n${proj.id}` ? "var(--acc)" : "var(--t4)" } }),
                h("div", { style: { fontSize: 8, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: drop === `n${proj.id}` ? "var(--acc)" : "var(--t4)" } }, "New"))
            ));
        })
      ),

      h("div", { className: "right" },
        h("div", { className: "tabs" },
          ["Notes", "Files", "Details"].map((t) => h("button", { key: t, className: `tab${tab === t.toLowerCase() ? " on" : ""}`, onClick: () => setTab(t.toLowerCase()) }, t))),

        tab === "notes" && h("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" } },
          h("div", { className: "notes-path" },
            h("i", { className: "ti ti-file-text", "aria-hidden": "true", style: { fontSize: 12, color: "var(--t4)" } }),
            h("span", { style: { fontSize: 10, fontFamily: "monospace", color: "var(--t3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, mdPath || "-"),
            editMd && h("span", { style: { fontSize: 9, padding: "2px 7px", borderRadius: 100, background: "var(--ambL)", color: "var(--amb)", fontWeight: 700, flexShrink: 0 } }, "EDITING")),
          editMd ? h("textarea", { className: "mdinput", value: curMd, onChange: (e) => updateMd(e.target.value) }) :
            h("div", { style: { flex: 1, overflowY: "auto", padding: "14px 18px 40px" } }, renderMd(curMd)),
          h("button", { className: `cib${editMd ? " on" : ""}`, title: editMd ? "Preview" : "Edit",
            style: { position: "absolute", bottom: 12, right: 12, width: 28, height: 28, fontSize: 12, boxShadow: "0 1px 4px rgba(0,0,0,.12)" },
            onClick: () => { if (editMd) { persistMd().finally(() => setEditMd(false)); } else { setEditMd(true); } } },
            h("i", { className: `ti ${editMd ? "ti-eye" : "ti-pencil"}`, "aria-hidden": "true" }))),

        tab === "files" && h("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } },
          h("div", { style: { padding: "10px 12px 0" } },
            h("div", { className: "srch" },
              h("i", { className: "ti ti-search", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t4)" } }),
              h("input", { value: fs, onChange: (e) => setFs(e.target.value), placeholder: "Search files..." }))),
          avTypes.length > 0 && h("div", { style: { display: "flex", gap: 5, padding: "8px 12px 6px", flexWrap: "wrap" } },
            h("button", { className: `fchip${ff === "all" ? " on" : ""}`, onClick: () => setFf("all") }, "All"),
            ...avTypes.map((t) => h("button", { key: t, className: `fchip${ff === t ? " on" : ""}`, onClick: () => setFf(t) }, t.toUpperCase()))),
          h("div", { style: { flex: 1, overflowY: "auto", padding: "4px" } }, FT),
          h("div", { style: { padding: "10px 12px", borderTop: "1px solid var(--bdr)", flexShrink: 0 } },
            selFile && h("div", { style: { fontSize: 10, color: "var(--t3)", marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 } }, selFile.name),
            h("button", { className: "btn-d", disabled: !selFile, onClick: openPrint },
              h("i", { className: "ti ti-printer", "aria-hidden": "true", style: { fontSize: 15 } }),
              selFile ? `Print ${selFile.name.split(".").pop().toUpperCase()}` : "Select a file to print"))),

        tab === "details" && DET
      )
    ),

    Modal,

    ctxMenu && h("div", { className: "ctx", style: { left: ctxMenu.x, top: ctxMenu.y }, onClick: (e) => e.stopPropagation() },
      ctxMenu.kind === "iter" ? h(React.Fragment, null,
        h("div", { className: "ctx-i", onClick: () => { setMv(ctxMenu.it.label); setModal({ type: "rename", what: "iter", pid: selP?.name, ver: ctxMenu.it.ver }); setCtxMenu(null); } }, h("i", { className: "ti ti-pencil", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t3)" } }), " Rename"),
        h("div", { className: "ctx-i", onClick: () => dupI(ctxMenu.projId, ctxMenu.it) }, h("i", { className: "ti ti-copy", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t3)" } }), " Duplicate"),
        h("div", { className: "ctx-sep" }),
        h("div", { className: "ctx-i warn", onClick: () => { setModal({ type: "confirm", what: "iter", pid: selP?.name, ver: ctxMenu.it.ver, name: ctxMenu.it.label }); setCtxMenu(null); } }, h("i", { className: "ti ti-trash", "aria-hidden": "true", style: { fontSize: 13 } }), " Delete"))
      : h(React.Fragment, null,
        h("div", { className: "ctx-i", onClick: () => { notify("Open in Finder (stub)"); setCtxMenu(null); } }, h("i", { className: "ti ti-external-link", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t3)" } }), " Open in Finder"),
        h("div", { className: "ctx-i", onClick: () => { notify("Path copied (stub)"); setCtxMenu(null); } }, h("i", { className: "ti ti-copy", "aria-hidden": "true", style: { fontSize: 13, color: "var(--t3)" } }), " Copy path"),
        h("div", { className: "ctx-sep" }),
        h("div", { className: "ctx-i warn", onClick: () => removeFile(ctxMenu.itId, ctxMenu.file.name) }, h("i", { className: "ti ti-trash", "aria-hidden": "true", style: { fontSize: 13 } }), " Remove from iteration"))),

    toast && h("div", { className: "toast" }, h("i", { className: "ti ti-check", "aria-hidden": "true", style: { fontSize: 13 } }), toast)
  );
}

try {
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
} catch (err) {
  document.getElementById("root").innerHTML =
    `<div style="padding:24px;color:#E53E3E;font-size:13px;font-family:monospace;background:#FFF5F5;margin:16px;border-radius:8px;border:1px solid #FEB2B2"><strong>Error:</strong> ${err.message}</div>`;
}
