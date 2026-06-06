function sortAlpha(types) {
  return [...types].sort((a, b) => a.localeCompare(b));
}

/**
 * Compute resource creation order from a dependency map.
 *
 * If resource A depends on B, B is ordered before A. Types with no ordering
 * constraint relative to each other share a tier and are listed alphabetically
 * within that tier. Mutual dependencies are grouped into the same tier.
 *
 * @param {Map<string, Set<string>>} depsMap resource type -> types it depends on
 * @param {{ hiddenTypes?: Set<string> }} [options]
 * @returns {{
 *   tiers: string[][],
 *   flatOrder: string[],
 *   cyclicTypes: Set<string>,
 *   tierCount: number,
 *   resourceCount: number,
 * }}
 */
export function computeCreationOrder(depsMap, { hiddenTypes = new Set() } = {}) {
  const types = sortAlpha(
    [...depsMap.keys()].filter((type) => typeof type === "string" && !hiddenTypes.has(type))
  );
  const typeSet = new Set(types);

  const dependsOn = new Map(types.map((type) => [type, new Set()]));
  for (const type of types) {
    for (const dep of depsMap.get(type) || []) {
      if (typeof dep !== "string" || dep === type || !typeSet.has(dep)) continue;
      dependsOn.get(type).add(dep);
    }
  }

  const adj = new Map(types.map((type) => [type, new Set()]));
  for (const type of types) {
    for (const dep of dependsOn.get(type)) {
      adj.get(dep).add(type);
    }
  }

  const sccs = findStronglyConnectedComponents(types, adj);
  const componentByType = new Map();
  const components = sccs.map((members, index) => {
    const sortedMembers = sortAlpha(members);
    for (const member of sortedMembers) {
      componentByType.set(member, index);
    }
    return {
      id: index,
      members: sortedMembers,
      isCyclic: sortedMembers.length > 1,
    };
  });

  const componentEdges = new Map(components.map((c) => [c.id, new Set()]));
  for (const type of types) {
    const fromId = componentByType.get(type);
    for (const dependent of adj.get(type) || []) {
      const toId = componentByType.get(dependent);
      if (fromId === toId) continue;
      componentEdges.get(fromId).add(toId);
    }
  }

  const componentLevel = new Map(components.map((c) => [c.id, 0]));
  const componentOrder = topologicalSortComponents(components, componentEdges);

  for (const componentId of componentOrder) {
    const component = components[componentId];
    let nextLevel = 0;

    for (const type of component.members) {
      for (const dep of dependsOn.get(type)) {
        const depComponentId = componentByType.get(dep);
        if (depComponentId === component.id) continue;
        nextLevel = Math.max(nextLevel, componentLevel.get(depComponentId) + 1);
      }
    }

    componentLevel.set(component.id, nextLevel);
  }

  const tiersByLevel = new Map();
  for (const component of components) {
    const level = componentLevel.get(component.id) || 0;
    if (!tiersByLevel.has(level)) tiersByLevel.set(level, []);
    tiersByLevel.get(level).push(...component.members);
  }

  const tiers = [...tiersByLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => sortAlpha(tiersByLevel.get(level)));

  const cyclicTypes = new Set();
  for (const component of components) {
    if (component.isCyclic) {
      for (const member of component.members) cyclicTypes.add(member);
    }
  }

  const flatOrder = tiers.flat();

  return {
    tiers,
    flatOrder,
    cyclicTypes,
    tierCount: tiers.length,
    resourceCount: flatOrder.length,
  };
}

function findStronglyConnectedComponents(types, adj) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowlink = new Map();
  const sccs = [];

  const strongConnect = (node) => {
    indices.set(node, index);
    lowlink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adj.get(node) || []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowlink.set(node, Math.min(lowlink.get(node), lowlink.get(next)));
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node), indices.get(next)));
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const component = [];
      let current = "";
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      sccs.push(component);
    }
  };

  for (const type of types) {
    if (!indices.has(type)) strongConnect(type);
  }

  return sccs;
}

function topologicalSortComponents(components, componentEdges) {
  const inDegree = new Map(components.map((c) => [c.id, 0]));

  for (const [, targets] of componentEdges) {
    for (const toId of targets) {
      inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
    }
  }

  const ready = components
    .filter((c) => (inDegree.get(c.id) || 0) === 0)
    .sort((a, b) => a.members[0].localeCompare(b.members[0]))
    .map((c) => c.id);

  const order = [];

  while (ready.length) {
    const componentId = ready.shift();
    order.push(componentId);

    for (const nextId of componentEdges.get(componentId) || []) {
      inDegree.set(nextId, inDegree.get(nextId) - 1);
      if (inDegree.get(nextId) === 0) {
        const nextComponent = components[nextId];
        let insertAt = ready.length;
        for (let i = 0; i < ready.length; i += 1) {
          if (nextComponent.members[0].localeCompare(components[ready[i]].members[0]) < 0) {
            insertAt = i;
            break;
          }
        }
        ready.splice(insertAt, 0, nextId);
      }
    }
  }

  if (order.length < components.length) {
    const remaining = components
      .filter((c) => !order.includes(c.id))
      .sort((a, b) => a.members[0].localeCompare(b.members[0]))
      .map((c) => c.id);
    order.push(...remaining);
  }

  return order;
}
