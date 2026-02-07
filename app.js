const { useState, useMemo, useRef, useEffect } = React;

const ENTITY_WIDTH = 200;
const RESIZE_MIN_W = 160;
const RESIZE_MAX_W = 360;
const RESIZE_MIN_H = 140;
const RESIZE_MAX_H = 520;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 26;
const SNAP_DISTANCE = 8;

const emptyAttribute = () => ({
  id: crypto.randomUUID(),
  name: "new_field",
  type: "text",
  isPrimary: false,
  isNullable: true,
});

const defaultEntity = (name, x, y) => ({
  id: crypto.randomUUID(),
  name,
  x,
  y,
  width: ENTITY_WIDTH,
  height: 0,
  attributes: [
    {
      id: crypto.randomUUID(),
      name: "id",
      type: "uuid",
      isPrimary: true,
      isNullable: false,
    },
    {
      id: crypto.randomUUID(),
      name: "created_at",
      type: "timestamp",
      isPrimary: false,
      isNullable: false,
    },
  ],
});

const defaultModel = () => ({
  entities: [
    defaultEntity("customers", 120, 120),
    defaultEntity("orders", 480, 260),
  ],
  relationships: [
    {
      id: crypto.randomUUID(),
      from: null,
      to: null,
      type: "1:N",
      label: "places",
    },
  ],
});

function App() {
  const API_BASE = "http://localhost:3001";
  const PG_TYPES = [
    "smallint",
    "integer",
    "bigint",
    "serial",
    "bigserial",
    "numeric",
    "decimal",
    "real",
    "double precision",
    "money",
    "varchar",
    "text",
    "char",
    "boolean",
    "date",
    "time",
    "timestamp",
    "timestamptz",
    "interval",
    "uuid",
    "json",
    "jsonb",
    "bytea",
  ];
  const [model, setModel] = useState(() => {
    const model = defaultModel();
    model.relationships[0].from = model.entities[0].id;
    model.relationships[0].to = model.entities[1].id;
    return model;
  });
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [viewMode, setViewMode] = useState("physical");
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [guides, setGuides] = useState({ x: [], y: [] });
  const [guidesOn, setGuidesOn] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [ddlEntityId, setDdlEntityId] = useState(null);
  const [selectedRelId, setSelectedRelId] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedAttrId, setSelectedAttrId] = useState(null);

  const boardRef = useRef(null);
  const dragRef = useRef({ id: null, offsetX: 0, offsetY: 0 });
  const panRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeRef = useRef({
    id: null,
    startX: 0,
    startY: 0,
    startWidth: ENTITY_WIDTH,
    startHeight: 0,
  });

  useEffect(() => {
    const loadLatest = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/model`);
        if (!res.ok) return;
        const data = await res.json();
        if (data) {
          setModel(data);
          setStatus("Loaded latest model from MongoDB.");
        }
      } catch (err) {
        setStatus("Could not load model from MongoDB.");
      }
    };
    loadLatest();
  }, []);

  const selectedEntity =
    model.entities.find((e) => e.id === selectedEntityId) || null;

  useEffect(() => {
    if (!selectedEntity || !selectedAttrId) return;
    const exists = selectedEntity.attributes.some(
      (attr) => attr.id === selectedAttrId,
    );
    if (!exists) {
      setSelectedAttrId(null);
    }
  }, [selectedEntityId, selectedAttrId, model]);

  const relationshipLookup = useMemo(() => {
    const map = new Map();
    model.entities.forEach((entity) => map.set(entity.id, entity));
    return map;
  }, [model.entities]);

  const handleMouseDown = (event, entityId) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const entity = model.entities.find((e) => e.id === entityId);
    if (!entity) return;
    dragRef.current = {
      id: entityId,
      offsetX:
        event.clientX - rect.left - (entity.x * viewport.scale + viewport.x),
      offsetY:
        event.clientY - rect.top - (entity.y * viewport.scale + viewport.y),
    };
    setSelectedEntityId(entityId);
  };

  const handleMouseMove = (event) => {
    const { id, offsetX, offsetY } = dragRef.current;
    if (resizeRef.current.id) {
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const currentX =
        (event.clientX - rect.left - viewport.x) / viewport.scale;
      const currentY =
        (event.clientY - rect.top - viewport.y) / viewport.scale;
      const deltaX = currentX - resizeRef.current.startX;
      const deltaY = currentY - resizeRef.current.startY;
      const entity = model.entities.find(
        (item) => item.id === resizeRef.current.id,
      );
      const minHeight = entity ? getEntityMinHeight(entity) : RESIZE_MIN_H;
      const nextWidth = Math.min(
        RESIZE_MAX_W,
        Math.max(RESIZE_MIN_W, resizeRef.current.startWidth + deltaX),
      );
      const nextHeight = Math.min(
        RESIZE_MAX_H,
        Math.max(minHeight, resizeRef.current.startHeight + deltaY),
      );
      setModel((prev) => ({
        ...prev,
        entities: prev.entities.map((entity) =>
          entity.id === resizeRef.current.id
            ? { ...entity, width: nextWidth, height: nextHeight }
            : entity,
        ),
      }));
      return;
    }
    if (!id) {
      if (!isPanning) return;
      const nextX = panRef.current.startX + (event.clientX - panRef.current.x);
      const nextY = panRef.current.startY + (event.clientY - panRef.current.y);
      setViewport((prev) => ({ ...prev, x: nextX, y: nextY }));
      return;
    }
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const rawX =
      (event.clientX - rect.left - offsetX - viewport.x) / viewport.scale;
    const rawY =
      (event.clientY - rect.top - offsetY - viewport.y) / viewport.scale;
    let nextX = Math.max(24, rawX);
    let nextY = Math.max(24, rawY);

    if (guidesOn) {
      const active = model.entities.find((entity) => entity.id === id);
      const activeHeight = active ? getEntityHeight(active) : 120;
      const activeWidth = active?.width ?? ENTITY_WIDTH;
      const pointsX = [nextX, nextX + activeWidth / 2, nextX + activeWidth];
      const pointsY = [nextY, nextY + activeHeight / 2, nextY + activeHeight];
      const guideX = [];
      const guideY = [];

      model.entities.forEach((entity) => {
        if (entity.id === id) return;
        const height = getEntityHeight(entity);
        const targetsX = [
          entity.x,
          entity.x + entity.width / 2,
          entity.x + entity.width,
        ];
        const targetsY = [entity.y, entity.y + height / 2, entity.y + height];
        pointsX.forEach((point) => {
          targetsX.forEach((target) => {
            if (Math.abs(point - target) <= SNAP_DISTANCE) {
              const delta = target - point;
              nextX += delta;
              guideX.push(target);
            }
          });
        });
        pointsY.forEach((point) => {
          targetsY.forEach((target) => {
            if (Math.abs(point - target) <= SNAP_DISTANCE) {
              const delta = target - point;
              nextY += delta;
              guideY.push(target);
            }
          });
        });
      });

      setGuides({ x: guideX, y: guideY });
    }
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) =>
        entity.id === id ? { ...entity, x: nextX, y: nextY } : entity,
      ),
    }));
  };

  const handleMouseUp = () => {
    dragRef.current = { id: null, offsetX: 0, offsetY: 0 };
    resizeRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      startWidth: ENTITY_WIDTH,
      startHeight: 0,
    };
    setGuides({ x: [], y: [] });
    setIsPanning(false);
    setIsResizing(false);
  };

  const addEntity = () => {
    const name = `table_${model.entities.length + 1}`;
    const entity = defaultEntity(name, 160 + model.entities.length * 60, 120);
    setModel((prev) => ({
      ...prev,
      entities: [...prev.entities, entity],
    }));
    setSelectedEntityId(entity.id);
  };

  const deleteEntity = (id) => {
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.filter((entity) => entity.id !== id),
      relationships: prev.relationships.filter(
        (rel) => rel.from !== id && rel.to !== id,
      ),
    }));
    if (selectedEntityId === id) {
      setSelectedEntityId(null);
    }
  };

  const addAttribute = () => {
    if (!selectedEntity) return;
    const attr = emptyAttribute();
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) =>
        entity.id === selectedEntity.id
          ? { ...entity, attributes: [...entity.attributes, attr] }
          : entity,
      ),
    }));
  };

  const updateEntity = (updates) => {
    if (!selectedEntity) return;
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) =>
        entity.id === selectedEntity.id ? { ...entity, ...updates } : entity,
      ),
    }));
  };

  const updateAttribute = (attrId, updates) => {
    if (!selectedEntity) return;
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) => {
        if (entity.id !== selectedEntity.id) return entity;
        return {
          ...entity,
          attributes: entity.attributes.map((attr) =>
            attr.id === attrId ? { ...attr, ...updates } : attr,
          ),
        };
      }),
    }));
  };

  const deleteAttribute = (attrId) => {
    if (!selectedEntity) return;
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) => {
        if (entity.id !== selectedEntity.id) return entity;
        return {
          ...entity,
          attributes: entity.attributes.filter((attr) => attr.id !== attrId),
        };
      }),
    }));
    if (selectedAttrId === attrId) {
      setSelectedAttrId(null);
    }
  };

  const startLink = () => {
    if (!selectedEntity) return;
    setLinkMode(true);
    setLinkFrom(selectedEntity.id);
    setStatus("Pick the target entity.");
  };

  const completeLink = (targetId) => {
    if (!linkMode || !linkFrom || linkFrom === targetId) return;
    setModel((prev) => ({
      ...prev,
      relationships: [
        ...prev.relationships,
        {
          id: crypto.randomUUID(),
          from: linkFrom,
          to: targetId,
          type: "1:N",
          label: "relates_to",
        },
      ],
    }));
    setLinkMode(false);
    setLinkFrom(null);
    setStatus("Relationship created.");
  };

  const cancelLink = () => {
    setLinkMode(false);
    setLinkFrom(null);
    setStatus("Link canceled.");
  };

  const updateRelationship = (relId, updates) => {
    setModel((prev) => ({
      ...prev,
      relationships: prev.relationships.map((rel) =>
        rel.id === relId ? { ...rel, ...updates } : rel,
      ),
    }));
  };

  const deleteRelationship = (relId) => {
    setModel((prev) => ({
      ...prev,
      relationships: prev.relationships.filter((rel) => rel.id !== relId),
    }));
    if (selectedRelId === relId) {
      setSelectedRelId(null);
    }
  };

  const exportJson = () => {
    const payload = JSON.stringify(model, null, 2);
    setJsonDraft(payload);
    setStatus("Model exported to JSON box.");
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!parsed.entities || !parsed.relationships) {
        setStatus("Invalid JSON: missing entities or relationships.");
        return;
      }
      setModel(parsed);
      setSelectedEntityId(null);
      setStatus("Model imported.");
    } catch (err) {
      setStatus("Invalid JSON format.");
    }
  };

  const saveToMongo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: model }),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("Model saved to MongoDB.");
      setToast("Save it successfully");
      setTimeout(() => setToast(""), 2000);
    } catch (err) {
      setStatus("Failed to save to MongoDB.");
    }
  };

  const ddl = useMemo(() => {
    const tableDdls = model.entities.map((entity) => {
      const columns = entity.attributes.map((attr) => {
        const type = attr.type || "text";
        const pk = attr.isPrimary ? " PRIMARY KEY" : "";
        const nullable = attr.isNullable ? "" : " NOT NULL";
        return `  ${attr.name} ${type}${nullable}${pk}`;
      });
      return `CREATE TABLE ${entity.name} (\n${columns.join(",\n")}\n);`;
    });

    const relDdls = model.relationships
      .map((rel) => {
        const from = relationshipLookup.get(rel.from);
        const to = relationshipLookup.get(rel.to);
        if (!from || !to) return "";
        const fromPk =
          from.attributes.find((attr) => attr.isPrimary) || from.attributes[0];
        if (!fromPk) return "";
        const fkColumn = `${from.name}_${fromPk.name}`;

        if (rel.type === "N:N") {
          const joinTable = `${from.name}_${to.name}`;
          return `CREATE TABLE ${joinTable} (\n  ${from.name}_${fromPk.name} ${fromPk.type} NOT NULL,\n  ${to.name}_${fromPk.name} ${fromPk.type} NOT NULL\n);\nALTER TABLE ${joinTable} ADD CONSTRAINT fk_${joinTable}_${from.name} FOREIGN KEY (${from.name}_${fromPk.name}) REFERENCES ${from.name}(${fromPk.name});\nALTER TABLE ${joinTable} ADD CONSTRAINT fk_${joinTable}_${to.name} FOREIGN KEY (${to.name}_${fromPk.name}) REFERENCES ${to.name}(${fromPk.name});`;
        }

        const target = rel.type === "1:N" ? to : from;
        const source = rel.type === "1:N" ? from : to;
        return `ALTER TABLE ${target.name} ADD COLUMN ${fkColumn} ${fromPk.type};\nALTER TABLE ${target.name} ADD CONSTRAINT fk_${target.name}_${source.name} FOREIGN KEY (${fkColumn}) REFERENCES ${source.name}(${fromPk.name});`;
      })
      .filter(Boolean);

    return [...tableDdls, ...relDdls].join("\n\n");
  }, [model]);

  const entityDdl = (entity) => {
    if (!entity) return "";
    const columns = entity.attributes.map((attr) => {
      const type = attr.type || "text";
      const pk = attr.isPrimary ? " PRIMARY KEY" : "";
      const nullable = attr.isNullable ? "" : " NOT NULL";
      return `  ${attr.name} ${type}${nullable}${pk}`;
    });

    const fkLines = model.relationships
      .filter((rel) => rel.from === entity.id || rel.to === entity.id)
      .map((rel) => {
        const from = relationshipLookup.get(rel.from);
        const to = relationshipLookup.get(rel.to);
        if (!from || !to) return "";
        const fromPk =
          from.attributes.find((attr) => attr.isPrimary) || from.attributes[0];
        if (!fromPk) return "";
        const fkColumn = `${from.name}_${fromPk.name}`;
        if (rel.type === "N:N") {
          const joinTable = `${from.name}_${to.name}`;
          return `-- join table\nCREATE TABLE ${joinTable} (\n  ${from.name}_${fromPk.name} ${fromPk.type} NOT NULL,\n  ${to.name}_${fromPk.name} ${fromPk.type} NOT NULL\n);`;
        }
        const target = rel.type === "1:N" ? to : from;
        const source = rel.type === "1:N" ? from : to;
        if (target.id !== entity.id) return "";
        return `ALTER TABLE ${target.name} ADD COLUMN ${fkColumn} ${fromPk.type};\nALTER TABLE ${target.name} ADD CONSTRAINT fk_${target.name}_${source.name} FOREIGN KEY (${fkColumn}) REFERENCES ${source.name}(${fromPk.name});`;
      })
      .filter(Boolean);

    return `CREATE TABLE ${entity.name} (\n${columns.join(",\n")}\n);\n\n${fkLines.join("\n\n")}`.trim();
  };

  const zoomBy = (factor) => {
    setViewport((prev) => {
      const nextScale = Math.min(2, Math.max(0.5, prev.scale * factor));
      return { ...prev, scale: nextScale };
    });
  };

  const resetViewport = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  const autoLayout = () => {
    const columns = 3;
    const gapX = 260;
    const gapY = 220;
    setModel((prev) => ({
      ...prev,
      entities: prev.entities.map((entity, index) => ({
        ...entity,
        x: 100 + (index % columns) * gapX,
        y: 80 + Math.floor(index / columns) * gapY,
      })),
    }));
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX - viewport.x) / viewport.scale;
    const worldY = (pointerY - viewport.y) / viewport.scale;
    const scaleFactor = event.deltaY < 0 ? 1.1 : 0.9;
    setViewport((prev) => {
      const nextScale = Math.min(2, Math.max(0.5, prev.scale * scaleFactor));
      const nextX = pointerX - worldX * nextScale;
      const nextY = pointerY - worldY * nextScale;
      return { x: nextX, y: nextY, scale: nextScale };
    });
  };

  const handleCanvasMouseDown = (event) => {
    if (event.target.closest(".entity")) return;
    if (!(spaceDown || event.button === 1 || event.button === 2)) return;
    setIsPanning(true);
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: viewport.x,
      startY: viewport.y,
    };
  };

  const handleResizeMouseDown = (event, entity) => {
    event.stopPropagation();
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const startX = (event.clientX - rect.left - viewport.x) / viewport.scale;
    const startY = (event.clientY - rect.top - viewport.y) / viewport.scale;
    resizeRef.current = {
      id: entity.id,
      startX,
      startY,
      startWidth: entity.width ?? ENTITY_WIDTH,
      startHeight: getEntityHeight(entity),
    };
    setIsResizing(true);
    setSelectedEntityId(entity.id);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Space") {
        setSpaceDown(true);
      }
    };
    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const getEntityMinHeight = (entity) => {
    return HEADER_HEIGHT + entity.attributes.length * ROW_HEIGHT + 16;
  };

  const getEntityHeight = (entity) => {
    return Math.max(entity.height || 0, getEntityMinHeight(entity), RESIZE_MIN_H);
  };

  const getAttrY = (entity, attrId) => {
    if (!attrId) return entity.y + HEADER_HEIGHT / 2;
    const index = entity.attributes.findIndex((attr) => attr.id === attrId);
    if (index === -1) return entity.y + HEADER_HEIGHT / 2;
    return entity.y + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <div
      className="app"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <aside className="sidebar">
        <div>
          <h1>Data Modeler</h1>
          <p>Drag entities, define attributes, and wire relationships.</p>
        </div>

        <div className="card">
          <h2>Project</h2>
          <div className="field">
            <label>View Mode</label>
            <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
              <option value="physical">Physical View</option>
              <option value="logical">Logical View</option>
            </select>
          </div>
          <div className="toolbar">
            <button onClick={addEntity}>Add Entity</button>
            <button className="secondary save-btn" onClick={saveToMongo}>
              Save
            </button>
            <button className="secondary" onClick={exportJson}>
              Export JSON
            </button>
            <button className="secondary" onClick={() => setJsonDraft("")}>
              Clear JSON
            </button>
            <button className="secondary" onClick={autoLayout}>
              Auto-layout
            </button>
            <button
              className="secondary"
              onClick={() => setGuidesOn((prev) => !prev)}
            >
              {guidesOn ? "Guides On" : "Guides Off"}
            </button>
          </div>
          <div className="divider"></div>
          <div className="field">
            <label>Import / Export JSON</label>
            <textarea
              value={jsonDraft}
              onChange={(event) => setJsonDraft(event.target.value)}
              placeholder="Paste JSON here"
            />
            <button className="secondary" onClick={importJson}>
              Import JSON
            </button>
          </div>
        </div>

        <div className="card">
          <h2>DDL (PostgreSQL)</h2>
          <textarea
            readOnly
            value={
              viewMode === "physical"
                ? ddl
                : "DDL is only available in Physical View."
            }
          />
        </div>
      </aside>

      <main
        className="canvas-wrap"
        ref={boardRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          if (
            event.target.closest(".rel-line") ||
            event.target.closest(".rel-hit") ||
            event.target.closest(".rel-delete")
          ) {
            return;
          }
          setSelectedRelId(null);
        }}
      >
        <div className="canvas-grid"></div>
        <div
          className="viewport"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <svg width="100%" height="100%">
            {model.relationships.map((rel) => {
              const from = relationshipLookup.get(rel.from);
              const to = relationshipLookup.get(rel.to);
              if (!from || !to) return null;
              const startX = from.x + (from.width ?? ENTITY_WIDTH);
              const startY = getAttrY(from, rel.fromAttr);
              const endX = to.x;
              const endY = getAttrY(to, rel.toAttr);
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;
              const isSelected = selectedRelId === rel.id;
              return (
                <g key={rel.id} className="rel-group">
                  <path
                    d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                    stroke="transparent"
                    strokeWidth="16"
                    fill="none"
                    className="rel-hit"
                    onClick={() => setSelectedRelId(rel.id)}
                  />
                  <path
                    d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                    stroke="#4ecdc4"
                    strokeWidth="2"
                    fill="none"
                    className="rel-line"
                    onClick={() => setSelectedRelId(rel.id)}
                  />
                  <text x={midX + 6} y={midY - 6} fill="#98a2b3" fontSize="12">
                    {rel.type}
                  </text>
                  {isSelected && (
                    <g
                      className="rel-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteRelationship(rel.id);
                      }}
                    >
                      <rect
                        x={midX - 10}
                        y={midY - 22}
                        width="20"
                        height="20"
                        rx="6"
                      />
                      <text x={midX} y={midY - 8}>
                        ×
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {model.entities.map((entity) => (
            <div
              key={entity.id}
              className={`entity ${selectedEntityId === entity.id ? "selected" : ""}`}
              style={{
                left: entity.x,
                top: entity.y,
                width: entity.width ?? ENTITY_WIDTH,
                height: getEntityHeight(entity),
              }}
              onMouseDown={(event) => handleMouseDown(event, entity.id)}
              onClick={() => {
                setSelectedEntityId(entity.id);
                setSelectedRelId(null);
                if (selectedEntityId !== entity.id) {
                  setSelectedAttrId(null);
                }
                if (linkMode && linkFrom && linkFrom !== entity.id) {
                  completeLink(entity.id);
                }
              }}
              onDoubleClick={() => setDdlEntityId(entity.id)}
            >
              <header>
                <span>{entity.name}</span>
                <button
                  title="Delete entity"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteEntity(entity.id);
                  }}
                >
                  ✕
                </button>
              </header>
              <ul>
              {entity.attributes.map((attr) => (
                  <li
                    key={attr.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEntityId(entity.id);
                      setSelectedAttrId(attr.id);
                    }}
                    className={selectedAttrId === attr.id ? "attr-selected" : ""}
                  >
                    {viewMode === "physical" && (
                      <span className="badge">
                        {attr.isPrimary ? "PK" : "COL"}
                      </span>
                    )}
                    {attr.name}
                    {viewMode === "physical" ? ` : ${attr.type}` : ""}
                  </li>
                ))}
              </ul>
              <span
                className="resize-handle"
                onMouseDown={(event) => handleResizeMouseDown(event, entity)}
                title="Drag to resize"
              ></span>
            </div>
          ))}
        </div>

        {guidesOn && (guides.x.length > 0 || guides.y.length > 0) && (
          <div className="guides">
            {guides.x.map((x, index) => (
              <span
                key={`gx-${index}`}
                className="guide-line x"
                style={{ left: x * viewport.scale + viewport.x }}
              />
            ))}
            {guides.y.map((y, index) => (
              <span
                key={`gy-${index}`}
                className="guide-line y"
                style={{ top: y * viewport.scale + viewport.y }}
              />
            ))}
          </div>
        )}
      </main>

      <aside className="rightbar">
        <div className="card">
          <h2>Entity</h2>
          {selectedEntity ? (
            <>
              <div className="field">
                <label>Name</label>
                <input
                  value={selectedEntity.name}
                  onChange={(event) =>
                    updateEntity({ name: event.target.value })
                  }
                />
              </div>

              <div className="toolbar">
                <button className="secondary" onClick={addAttribute}>
                  Add Attribute
                </button>
                <button className="secondary" onClick={startLink}>
                  Link
                </button>
                <button
                  className="danger"
                  onClick={() => deleteEntity(selectedEntity.id)}
                >
                  Delete
                </button>
              </div>
              {linkMode && (
                <p>
                  Link mode active: pick a target entity or{" "}
                  <button className="secondary" onClick={cancelLink}>
                    cancel
                  </button>
                  .
                </p>
              )}

              <div className="divider"></div>

              {selectedAttrId ? (() => {
                const attr = selectedEntity.attributes.find((item) => item.id === selectedAttrId);
                if (!attr) {
                  return <p>Select an attribute to edit.</p>;
                }
                return (
                  <div className="card" style={{ marginBottom: "10px" }}>
                    <div className="field">
                      <label>Attribute</label>
                      <input
                        value={attr.name}
                        onChange={(event) =>
                          updateAttribute(attr.id, { name: event.target.value })
                        }
                      />
                    </div>
                    {viewMode === "physical" && (
                      <>
                        <div className="field">
                          <label>Type</label>
                          <select
                            value={attr.type}
                            onChange={(event) =>
                              updateAttribute(attr.id, { type: event.target.value })
                            }
                          >
                            {PG_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Primary Key</label>
                          <select
                            value={attr.isPrimary ? "yes" : "no"}
                            onChange={(event) =>
                              updateAttribute(attr.id, {
                                isPrimary: event.target.value === "yes",
                              })
                            }
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Nullable</label>
                          <select
                            value={attr.isNullable ? "yes" : "no"}
                            onChange={(event) =>
                              updateAttribute(attr.id, {
                                isNullable: event.target.value === "yes",
                              })
                            }
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      </>
                    )}
                    <div className="toolbar">
                      <button className="secondary" onClick={() => setSelectedAttrId(null)}>
                        Close
                      </button>
                      <button
                        className="danger"
                        onClick={() => deleteAttribute(attr.id)}
                      >
                        Delete Attribute
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <p>Select an attribute to edit.</p>
              )}
            </>
          ) : (
            <p>Select an entity to edit its details.</p>
          )}
        </div>

        <div className="card">
          <h2>Relationships</h2>
          <div className="relationships">
            {selectedRelId ? (() => {
              const rel = model.relationships.find((item) => item.id === selectedRelId);
              if (!rel) return <p>Select a relationship to edit.</p>;
              const from = relationshipLookup.get(rel.from);
              const to = relationshipLookup.get(rel.to);
              return (
                <div className="item">
                  <div>
                    <strong>{from ? from.name : "Unknown"}</strong> →{" "}
                    <strong>{to ? to.name : "Unknown"}</strong>
                  </div>
                  <div className="field" style={{ marginTop: "8px" }}>
                    <label>Label</label>
                    <input
                      value={rel.label}
                      onChange={(event) =>
                        updateRelationship(rel.id, {
                          label: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>From Attribute</label>
                    <select
                      value={rel.fromAttr || ""}
                      onChange={(event) =>
                        updateRelationship(rel.id, {
                          fromAttr: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Entity header</option>
                      {from &&
                        from.attributes.map((attr) => (
                          <option key={attr.id} value={attr.id}>
                            {attr.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>To Attribute</label>
                    <select
                      value={rel.toAttr || ""}
                      onChange={(event) =>
                        updateRelationship(rel.id, {
                          toAttr: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Entity header</option>
                      {to &&
                        to.attributes.map((attr) => (
                          <option key={attr.id} value={attr.id}>
                            {attr.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Cardinality</label>
                    <select
                      value={rel.type}
                      onChange={(event) =>
                        updateRelationship(rel.id, { type: event.target.value })
                      }
                    >
                      <option value="1:1">1:1</option>
                      <option value="1:N">1:N</option>
                      <option value="N:N">N:N</option>
                    </select>
                  </div>
                  <div className="toolbar">
                    <button className="secondary" onClick={() => setSelectedRelId(null)}>
                      Close
                    </button>
                    <button
                      className="danger"
                      onClick={() => deleteRelationship(rel.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })() : (
              <p>Select a relationship to edit.</p>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Status</h2>
          <p>{status}</p>
          <div className="toolbar">
            <button className="secondary" onClick={() => zoomBy(1.1)}>
              Zoom In
            </button>
            <button className="secondary" onClick={() => zoomBy(0.9)}>
              Zoom Out
            </button>
            <button className="secondary" onClick={resetViewport}>
              Reset View
            </button>
          </div>
          <p>Tip: hold Space and drag to pan. Use mouse wheel to zoom.</p>
        </div>
      </aside>

      {ddlEntityId && (
        <div className="modal-backdrop" onClick={() => setDdlEntityId(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>DDL for {relationshipLookup.get(ddlEntityId)?.name}</h3>
              <button
                className="secondary"
                onClick={() => setDdlEntityId(null)}
              >
                Close
              </button>
            </header>
            <textarea
              readOnly
              value={entityDdl(relationshipLookup.get(ddlEntityId))}
            />
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
