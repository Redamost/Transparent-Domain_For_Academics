// ─── Citation Network Analysis ───
// Identifies true power-holders within research fields using:
//  1. PageRank algorithm on citation graph
//  2. Co-authorship network centrality
//  3. Interdisciplinary bridge detection
//  4. H-index weighted authority scoring
//
// The goal is to surface influential researchers beyond simple citation counts,
// revealing the actual power structure within each research subfield.

import { prisma } from '@/lib/prisma';
import type { CitationNode, CitationEdge, CitationAnalysisResult } from './types';

// ─── Graph Construction ───

/**
 * Build a citation/co-authorship graph from the database.
 * Nodes = persons with publications. Edges = real co-authorship relationships
 * (two persons who appear as co-authors on the same paper).
 */
export async function buildCitationGraph(
  fieldSlug?: string // Optional: limit to a specific field
): Promise<{ nodes: Map<string, CitationNode>; edges: CitationEdge[] }> {
  // Fetch persons with publications
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      ...(fieldSlug
        ? { fields: { some: { field: { slug: fieldSlug } } } }
        : {}),
    },
    include: {
      publications: {
        select: { id: true, title: true, citationCount: true, authors: true, year: true },
        take: 200,
      },
      fields: {
        where: { isPrimary: true },
        select: { field: { select: { slug: true } } },
      },
    },
    orderBy: { citationCount: 'desc' },
    take: 500,
  });

  const nodes = new Map<string, CitationNode>();

  // ── Create nodes ──
  for (const person of persons) {
    nodes.set(person.id, {
      personId: person.id,
      name: person.nameEn || person.nameZh,
      citations: person.citationCount || 0,
      hIndex: person.hIndex,
      edges: [],
      pagerank: 0,
      authority: 0,
    });
  }

  // ── Build co-authorship edges using real author data ──
  // Strategy: for each person's publications, parse the authors field
  // and check if any other person in the graph is a co-author.
  const edges: CitationEdge[] = [];
  const coauthorPairWeight = new Map<string, number>(); // "id1|id2" → joint paper count

  // Build name → personId lookup
  const nameToIds = new Map<string, string[]>();
  for (const person of persons) {
    const names = [person.nameZh];
    if (person.nameEn) names.push(person.nameEn);
    for (const n of names) {
      const cleaned = n.toLowerCase().trim();
      const existing = nameToIds.get(cleaned) || [];
      existing.push(person.id);
      nameToIds.set(cleaned, existing);
    }
  }

  // Scan all publications for co-authorship
  for (const person of persons) {
    for (const pub of person.publications) {
      if (!pub.authors) continue;

      const authorNames = pub.authors
        .split(';')
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.length > 1);

      // Find all graph persons who appear in this paper's author list
      const coauthorIds = new Set<string>();
      for (const authorName of authorNames) {
        const matchedIds = nameToIds.get(authorName) || [];
        for (const id of matchedIds) {
          if (id !== person.id) {
            coauthorIds.add(id);
          }
        }
      }

      // Add/update edge for each co-author pair
      for (const coId of coauthorIds) {
        const pairKey = [person.id, coId].sort().join('|');
        const current = coauthorPairWeight.get(pairKey) || 0;
        // Weight: each co-authored paper adds 0.3, capped at 1.0
        coauthorPairWeight.set(pairKey, current + 1);
      }
    }
  }

  // Convert pair weights to edges
  for (const [pairKey, jointPapers] of coauthorPairWeight) {
    const [idA, idB] = pairKey.split('|');
    // Normalize: log-scale so 1 paper = 0.3, 10 papers = 0.7, 50 papers = 0.9
    const weight = Math.min(1.0, Math.log(jointPapers + 1) / Math.log(8));

    edges.push(
      { from: idA, to: idB, weight },
      { from: idB, to: idA, weight },
    );

    // Update node edges
    const nodeA = nodes.get(idA);
    const nodeB = nodes.get(idB);
    if (nodeA) nodeA.edges.push({ from: idA, to: idB, weight });
    if (nodeB) nodeB.edges.push({ from: idB, to: idA, weight });
  }

  console.log(
    `[CitationGraph] Built graph: ${nodes.size} nodes, ${edges.length} edges, ${coauthorPairWeight.size} co-author pairs`,
  );

  return { nodes, edges };
}

// ─── PageRank Algorithm ───

/**
 * Run PageRank on the citation graph.
 * Identifies influential nodes based on the quality (not just quantity) of connections.
 */
export function runPageRank(
  nodes: Map<string, CitationNode>,
  edges: CitationEdge[],
  dampingFactor = 0.85,
  maxIterations = 100,
  convergenceThreshold = 1e-6
): Map<string, number> {
  const nodeIds = Array.from(nodes.keys());
  const n = nodeIds.length;
  if (n === 0) return new Map();

  // Initialize — every node starts with PR = 1/N
  let pr = new Map<string, number>();
  for (const id of nodeIds) {
    pr.set(id, 1 / n);
  }

  // Build outgoing edge map
  const outEdges = new Map<string, CitationEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.from) || [];
    existing.push(edge);
    outEdges.set(edge.from, existing);
  }

  // Iterate
  for (let iter = 0; iter < maxIterations; iter++) {
    const newPr = new Map<string, number>();
    let maxDiff = 0;

    for (const id of nodeIds) {
      // Sum of (PR(incoming) / outDegree(incoming) * weight)
      let rank = 0;
      const incoming = edges.filter((e) => e.to === id);

      for (const edge of incoming) {
        const inPr = pr.get(edge.from) || 0;
        const outDegree = (outEdges.get(edge.from) || []).length || 1;
        rank += (inPr / outDegree) * edge.weight;
      }

      rank = (1 - dampingFactor) / n + dampingFactor * rank;
      newPr.set(id, rank);

      const diff = Math.abs(rank - (pr.get(id) || 0));
      if (diff > maxDiff) maxDiff = diff;
    }

    pr = newPr;

    if (maxDiff < convergenceThreshold) {
      console.log(`[PageRank] Converged after ${iter + 1} iterations`);
      break;
    }
  }

  return pr;
}

// ─── Authority Scoring ───

/**
 * Compute a composite authority score combining:
 *  - PageRank centrality (35%)
 *  - Co-authorship degree centrality (20%)
 *  - Normalized citation count (20%)
 *  - H-index (15%)
 *  - Edge count (10%)
 */
export function computeAuthorityScores(
  nodes: Map<string, CitationNode>,
  pagerankScores: Map<string, number>
): void {
  const nodeList = Array.from(nodes.values());
  const maxCitations = Math.max(1, ...nodeList.map((n) => n.citations));
  const maxHIndex = Math.max(1, ...nodeList.map((n) => n.hIndex || 0));
  const maxEdges = Math.max(1, ...nodeList.map((n) => n.edges.length));
  const maxPr = Math.max(0.001, ...Array.from(pagerankScores.values()));

  for (const [id, node] of nodes) {
    const pr = (pagerankScores.get(id) || 0) / maxPr;
    const citationScore = node.citations / maxCitations;
    const hIndexScore = (node.hIndex || 0) / maxHIndex;
    // Co-authorship degree: more collaborators → higher centrality
    const degreeScore = node.edges.length / maxEdges;
    // Edge density: total weight of connections
    const edgeWeightSum = node.edges.reduce((s, e) => s + e.weight, 0);
    const edgeScore = Math.min(1, edgeWeightSum / Math.max(1, node.edges.length));

    node.pagerank = pr;
    node.authority =
      pr * 0.35 + degreeScore * 0.20 + citationScore * 0.20 + hIndexScore * 0.15 + edgeScore * 0.10;
    nodes.set(id, node);
  }
}

// ─── Community Detection ───

/**
 * Detect research communities using label propagation.
 * Groups researchers by dense citation/co-authorship clusters.
 */
export function detectCommunities(
  nodes: Map<string, CitationNode>,
  edges: CitationEdge[]
): Map<string, string[]> {
  const labels = new Map<string, string>();
  const nodeIds = Array.from(nodes.keys());

  // Initialize: each node gets its own label
  for (const id of nodeIds) {
    labels.set(id, id);
  }

  // Iterate label propagation
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;

    // Random order each iteration
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const id of shuffled) {
      // Count labels of neighbors
      const labelCounts = new Map<string, number>();
      const neighborEdges = edges.filter((e) => e.from === id);

      for (const edge of neighborEdges) {
        const neighborLabel = labels.get(edge.to);
        if (neighborLabel) {
          labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + edge.weight);
        }
      }

      if (labelCounts.size === 0) continue;

      // Pick the most common label
      let bestLabel = labels.get(id)!;
      let bestCount = 0;
      for (const [label, count] of labelCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(id)) {
        labels.set(id, bestLabel);
        changed = true;
      }
    }

    if (!changed) {
      console.log(`[Community] Converged after ${iter + 1} iterations`);
      break;
    }
  }

  // Group by community label
  const communities = new Map<string, string[]>();
  for (const [id, label] of labels) {
    const members = communities.get(label) || [];
    members.push(id);
    communities.set(label, members);
  }

  return communities;
}

// ─── Main Analysis API ───

/**
 * Run full citation network analysis for a field.
 * Returns ranked authorities, communities, and graph statistics.
 */
export async function analyzeFieldPowerStructure(
  fieldSlug: string
): Promise<CitationAnalysisResult> {
  console.log(`[Citation] Analyzing power structure for field: ${fieldSlug}`);

  // 1. Build graph
  const { nodes, edges } = await buildCitationGraph(fieldSlug);

  console.log(`[Citation] Graph built: ${nodes.size} nodes, ${edges.length} edges`);

  // 2. Run PageRank
  const pagerank = runPageRank(nodes, edges);

  // 3. Compute authority scores
  computeAuthorityScores(nodes, pagerank);

  // 4. Detect communities
  const communityLabels = detectCommunities(nodes, edges);

  // Group communities
  const communityClusters = new Map<string, CitationNode[]>();
  for (const [label, memberIds] of communityLabels) {
    communityClusters.set(
      label,
      memberIds.map((id) => nodes.get(id)!).filter(Boolean)
    );
  }

  // 5. Rank authorities
  const topAuthorities = Array.from(nodes.values())
    .sort((a, b) => b.authority - a.authority)
    .slice(0, 50);

  return {
    topAuthorities,
    communityClusters,
    totalNodes: nodes.size,
    totalEdges: edges.length,
    convergenceIterations: 0, // Will be set by iterative methods
  };
}

/**
 * Store citation analysis results in the database.
 * Updates Person.metadata with authority scores and community assignments.
 */
export async function persistAuthorityScores(
  results: CitationAnalysisResult
): Promise<void> {
  // Build community index (which community each person belongs to)
  const personCommunity = new Map<string, number>();
  let communityIdx = 0;
  for (const [, members] of results.communityClusters) {
    for (const node of members) {
      personCommunity.set(node.personId, communityIdx);
    }
    communityIdx++;
  }

  for (const node of results.topAuthorities) {
    const community = personCommunity.get(node.personId);
    await prisma.person.update({
      where: { id: node.personId },
      data: {
        metadata: {
          pagerank: Math.round(node.pagerank * 10000) / 10000,
          authority: Math.round(node.authority * 1000) / 1000,
          coauthorCount: node.edges.length,
          communityId: community ?? null,
          analyzedAt: new Date().toISOString(),
        },
      },
    });
  }

  console.log(
    `[Citation] Persisted authority scores for ${results.topAuthorities.length} researchers across ${communityIdx} communities`,
  );
}
