document.addEventListener('DOMContentLoaded', () => {
    // Canvas setup
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');

    // Graph data structure
    let graph = { nodes: [], edges: [], mstEdges: [] };

    // Global state
    let state = {
        isRunning: false,
        currentStep: 0,
        totalSteps: 0,
        steps: [],
        speed: 5,
        intervalId: null,
        consideringEdge: null,
        invalidEdges: [],
        priorityQueue: [],
        visitedNodes: new Set(),
        disjointSets: [],
        sortedEdges: null,
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        algorithmLocked: false,
    };

    // --- INITIALIZATION ---
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);
    initializeEventListeners();
    generateGraph(); // Generate initial graph
    updateAlgorithmUI();

    function updateEdgeDensityForGraphType() {
        const graphType = document.getElementById('graphTypeSelect').value;
        const edgeDensitySlider = document.getElementById('edgeDensity');
        const edgeDensityValue = document.getElementById('edgeDensityValue');
        
        if (graphType === 'cycle') {
            // Set minimum edge density based on node count for guaranteed cycles
            const nodeCount = parseInt(document.getElementById('nodeCount').value);
            let minDensity;
            
            if (nodeCount <= 5) minDensity = 40;
            else if (nodeCount <= 8) minDensity = 35;
            else if (nodeCount <= 12) minDensity = 30;
            else minDensity = 25;
            
            edgeDensitySlider.min = minDensity;
            
            // If current value is below minimum, set to minimum
            if (parseInt(edgeDensitySlider.value) < minDensity) {
                edgeDensitySlider.value = minDensity;
                edgeDensityValue.textContent = minDensity + '%';
            }
            
            edgeDensitySlider.disabled = false;
            showToast(`Guaranteed cycle mode: Minimum ${minDensity}% density required`, 'info');
            
        } else if (graphType === 'complete') {
            edgeDensitySlider.disabled = true;
            edgeDensitySlider.value = 100;
            edgeDensityValue.textContent = '100%';
        } else {
            // Random graph - reset to normal settings
            edgeDensitySlider.min = 30;
            edgeDensitySlider.disabled = false;
            // Don't change current value for random graphs
        }
    }


    // --- CORE ALGORITHMS ---
    function primsAlgorithm() {
        const startNodeSelect = document.getElementById('startNodeSelect');
        let startNodeId = parseInt(startNodeSelect.value);
        if (graph.nodes.length === 0 || !graph.nodes.find(n => n.id === startNodeId)) {
            if (graph.nodes.length > 0) {
                startNodeId = graph.nodes[0].id;
                showToast("Invalid start node selected, defaulting to the first node.", 'error');
            } else {
                 showToast("Cannot start Prim's algorithm on an empty graph.", 'error');
                 return;
            }
        }

        const steps = [];
        const visited = new Set();
        const edges = [...graph.edges];
        
        visited.add(startNodeId);
        
        const priorityQueue = [];
        edges.forEach(edge => {
            if ((edge.from === startNodeId && !visited.has(edge.to)) || (edge.to === startNodeId && !visited.has(edge.from))) {
                priorityQueue.push({ edge, weight: edge.weight });
            }
        });
        priorityQueue.sort((a, b) => a.weight - b.weight);
        
        steps.push({
            description: `<div class="step-highlight">Starting Prim's from node ${graph.nodes.find(n=>n.id === startNodeId).label}</div><div class="step-explanation">The algorithm begins. Visited set is initialized with the start node, and all its adjacent edges are added to a Priority Queue.</div>`,
            priorityQueue: clone(priorityQueue),
            visitedNodes: [...visited]
        });
        
        while (visited.size < graph.nodes.length && priorityQueue.length > 0) {
            const minEdgeItem = priorityQueue.shift();
            const minEdge = minEdgeItem.edge;
            
            const fromNodeLabel = graph.nodes.find(n => n.id === minEdge.from)?.label || '?';
            const toNodeLabel = graph.nodes.find(n => n.id === minEdge.to)?.label || '?';

            steps.push({
                action: 'considerEdge', edge: minEdge,
                description: `<div class="step-highlight">Extracting minimum edge</div><div class="step-explanation">The edge with the lowest weight, <strong>${fromNodeLabel}-${toNodeLabel}</strong> (weight ${minEdge.weight}), is removed from the Priority Queue for consideration.</div>`,
                priorityQueue: clone(priorityQueue), visitedNodes: [...visited]
            });
            
            const fromVisited = visited.has(minEdge.from);
            const toVisited = visited.has(minEdge.to);
            
            if ((fromVisited && !toVisited) || (!fromVisited && toVisited)) {
                const newNode = fromVisited ? minEdge.to : minEdge.from;
                const newNodeLabel = graph.nodes.find(n => n.id === newNode)?.label || '?';
                
                steps.push({
                    action: 'addEdge', edge: minEdge,
                    description: `<div class="step-highlight">✓ Edge added to MST</div><div class="step-explanation">This edge connects a visited node to an unvisited one (${newNodeLabel}). It's a safe edge to add to our Minimum Spanning Tree.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited]
                });
                
                visited.add(newNode);
                
                edges.forEach(edge => {
                    const fromNew = (edge.from === newNode && !visited.has(edge.to));
                    const toNew = (edge.to === newNode && !visited.has(edge.from));
                    if (fromNew || toNew) {
                         priorityQueue.push({ edge, weight: edge.weight });
                    }
                });
                priorityQueue.sort((a, b) => a.weight - b.weight);
                
                steps.push({
                    description: `<div class="step-highlight">Updating Priority Queue</div><div class="step-explanation">Node ${newNodeLabel} is now visited. All its edges that lead to unvisited nodes are added to the Priority Queue.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited]
                });
            } else {
                steps.push({
                    action: 'showInvalid', edge: minEdge, invalidEdges: [minEdge],
                    description: `<div class="step-highlight">❌ Edge discarded</div><div class="step-explanation">This edge connects two nodes that are already in the visited set. Adding it would create a cycle, so it is ignored.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited]
                });
            }
        }
        steps.push({ description: `<div class="step-highlight">Algorithm Finished</div><div class="step-explanation">No more valid edges can be added. The Minimum Spanning Tree is complete.</div>`, priorityQueue: [], visitedNodes: [...visited] });
        state.steps = steps;
    }

    function kruskalsAlgorithm() {
        if (graph.nodes.length === 0) {
            showToast("Cannot run Kruskal's algorithm on an empty graph.", "error");
            return;
        }
        const steps = [];
        const edges = [...graph.edges];
        
        edges.sort((a, b) => a.weight - b.weight);
        state.sortedEdges = clone(edges);

        const maxNodeId = graph.nodes.reduce((max, node) => Math.max(max, node.id), 0);
        const parent = Array.from({ length: maxNodeId + 1 }, (_, i) => i);

        const find = u => (parent[u] === u ? u : (parent[u] = find(parent[u])));
        const union = (u, v) => {
            const rootU = find(u);
            const rootV = find(v);
            if (rootU !== rootV) {
                parent[rootV] = rootU;
                return true;
            }
            return false;
        };
        const getDisjointSets = () => {
            const sets = {};
            graph.nodes.forEach(node => {
                const root = find(node.id);
                if (!sets[root]) sets[root] = [];
                sets[root].push(node.id);
            });
            return Object.values(sets);
        };
        
        steps.push({
            description: `<div class="step-highlight">Starting Kruskal's algorithm</div><div class="step-explanation">First, all edges in the graph are sorted by weight in ascending order. Each node starts in its own disjoint set.</div>`,
            sortedEdges: clone(edges), disjointSets: getDisjointSets()
        });
        
        let edgesAdded = 0;
        for (let i = 0; i < edges.length; i++) {
            if (edgesAdded >= graph.nodes.length - 1) break;
            const edge = edges[i];
            
            const fromNodeLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
            const toNodeLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';

            steps.push({
                action: 'considerEdge', edge,
                description: `<div class="step-highlight">Considering next edge</div><div class="step-explanation">The next edge in the sorted list, <strong>${fromNodeLabel}-${toNodeLabel}</strong> (weight ${edge.weight}), is considered.</div>`,
                sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets()
            });
            
            if (union(edge.from, edge.to)) {
                edgesAdded++;
                steps.push({
                    action: 'addEdge', edge,
                    description: `<div class="step-highlight">✓ Edge added to MST</div><div class="step-explanation">The nodes of this edge belong to different sets. Adding it will not form a cycle. It is added to the MST.</div>`,
                    sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets()
                });
                
                 steps.push({
                    description: `<div class="step-highlight">Union of sets</div><div class="step-explanation">The two disjoint sets connected by the new edge are now merged into a single set.</div>`,
                    sortedEdges: edges.slice(i+1), disjointSets: getDisjointSets()
                });
            } else {
                steps.push({
                    action: 'showInvalid', edge, invalidEdges: [edge],
                    description: `<div class="step-highlight">❌ Edge discarded</div><div class="step-explanation">The nodes of this edge already belong to the same set. Adding this edge would form a cycle, so it is discarded.</div>`,
                    sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets()
                });
            }
        }
        steps.push({ description: `<div class="step-highlight">Algorithm Finished</div><div class="step-explanation">The Minimum Spanning Tree is complete, or all edges have been considered.</div>`, sortedEdges: [], disjointSets: getDisjointSets() });
        state.steps = steps;
    }

    // --- ANIMATION & STEP EXECUTION ---
    function startVisualization() {
        resetAnimationState(false);
        
        const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
        if (selectedAlgorithm === 'prim') primsAlgorithm();
        else if (selectedAlgorithm === 'kruskal') kruskalsAlgorithm();
        
        if (state.steps.length > 0) {
            state.isRunning = true;
            state.totalSteps = state.steps.length;
            state.algorithmLocked = true;
            
            updateAnimationControls();
            state.intervalId = setInterval(animateStep, getAnimationDelay());
            showToast('Visualization started!', 'info');
        }
    }

    function animateStep() {
        if (state.currentStep < state.totalSteps) {
            executeStep(state.currentStep);
            state.currentStep++;
            updateAnimationControls();
        } else {
            clearInterval(state.intervalId);
            state.intervalId = null;
            state.isRunning = false;
            state.algorithmLocked = false;
            
            const totalWeight = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
            document.getElementById('algorithm-steps-panel').innerHTML = 
                `<div class="step-highlight">Algorithm complete!</div>
                 <div class="step-explanation">MST has ${graph.mstEdges.length} edges with total weight ${totalWeight}.</div>`;
            
            updateAnimationControls();
        }
    }

    function executeStep(stepIndex) {
        const step = state.steps[stepIndex];
        state.consideringEdge = null;
        state.invalidEdges = [];
        
        if (step.action === 'addEdge') {
            const edge = graph.edges.find(e => (e.from === step.edge.from && e.to === step.edge.to) || (e.from === step.edge.to && e.to === step.edge.from));
            if (edge) {
                edge.isInMST = true;
                if (!graph.mstEdges.includes(edge)) graph.mstEdges.push(edge);
            }
        } else if (step.action === 'considerEdge') {
            state.consideringEdge = step.edge;
        } else if (step.action === 'showInvalid') {
            state.invalidEdges = step.invalidEdges || [];
        }
        
        if (step.priorityQueue) state.priorityQueue = step.priorityQueue;
        if (step.visitedNodes) state.visitedNodes = new Set(step.visitedNodes);
        if (step.disjointSets) state.disjointSets = step.disjointSets;
        if (step.sortedEdges) state.sortedEdges = step.sortedEdges;
        
        document.getElementById('algorithm-steps-panel').innerHTML = step.description;
        drawGraph();
    }

    // --- GRAPH GENERATION ---
    function generateGraph() {
        resetFull();
        const type = document.getElementById('graphTypeSelect').value;
        const nodeCount = parseInt(document.getElementById('nodeCount').value);
        const edgeDensitySlider = document.getElementById('edgeDensity');

        if (type === 'cycle' && nodeCount < 3) {
        nodeCount = 5;
        document.getElementById('nodeCount').value = 5;
        document.getElementById('nodeCountValue').textContent = '5';
        showToast("Cycle graphs require at least 3 nodes. Using 5 nodes.", "warning");
        }
        
        edgeDensitySlider.disabled = type === 'complete';
        
        const edgeDensity = parseInt(edgeDensitySlider.value) / 100;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.35;
        
        for (let i = 0; i < nodeCount; i++) {
            const angle = (2 * Math.PI * i) / nodeCount;
            graph.nodes.push({ id: i, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle), label: String.fromCharCode(65 + i) });
        }

        const addEdge = (u, v, weight) => {
             if (u !== v && !graph.edges.some(e => (e.from === u && e.to === v) || (e.from === v && e.to === u))) {
                graph.edges.push({ from: u, to: v, weight, isInMST: false });
            }
        };

        if (type === 'random') {
            const parent = Array.from({ length: nodeCount }, (_, i) => i);
            const find = u => (parent[u] === u ? u : (parent[u] = find(parent[u])));
            const union = (u, v) => {
                const rootU = find(u);
                const rootV = find(v);
                if (rootU !== rootV) {
                    parent[rootV] = rootU;
                    return true;
                }
                return false;
            };
            
            let sets = nodeCount;
            while (sets > 1) {
                const u = Math.floor(Math.random() * nodeCount);
                const v = Math.floor(Math.random() * nodeCount);
                if (find(u) !== find(v)) {
                    addEdge(u, v, Math.floor(Math.random() * 20) + 1);
                    union(u, v);
                    sets--;
                }
            }

            const maxEdges = nodeCount * (nodeCount - 1) / 2;
            const targetEdges = Math.floor(maxEdges * edgeDensity);
            while (graph.edges.length < targetEdges && graph.edges.length < maxEdges) {
                const u = Math.floor(Math.random() * nodeCount);
                const v = Math.floor(Math.random() * nodeCount);
                addEdge(u, v, Math.floor(Math.random() * 20) + 1);
            }

        } else if (type === 'cycle') {
            // RELIABLE guaranteed cycle generation with density enforcement
            const nodeCount = parseInt(document.getElementById('nodeCount').value);
            const edgeDensity = parseInt(document.getElementById('edgeDensity').value) / 100;
            
            const maxPossibleEdges = nodeCount * (nodeCount - 1) / 2;
            const minRequiredEdges = Math.max(nodeCount + 2, Math.floor(nodeCount * 1.5)); // Ensure extra edges for cycles
            const targetEdges = Math.max(
                minRequiredEdges,
                Math.floor(maxPossibleEdges * edgeDensity)
            );

            // Clear any existing edges
            graph.edges = [];
            graph.mstEdges = [];

            // STRATEGY: Create multiple overlapping cycles to guarantee detection
            
            // 1. Primary Hamiltonian cycle
            for (let i = 0; i < nodeCount; i++) {
                const from = i;
                const to = (i + 1) % nodeCount;
                addEdge(from, to, Math.floor(Math.random() * 10) + 15); // Medium-high weight
            }

            // 2. Add multiple low-weight chord edges that create obvious cycles
            const chordCount = Math.max(2, Math.floor(nodeCount * 0.5));
            for (let i = 0; i < chordCount; i++) {
                const start = i;
                // Connect to various distances to create different cycle sizes
                const distances = [2, 3, Math.floor(nodeCount/2)];
                const distance = distances[Math.floor(Math.random() * distances.length)];
                const end = (start + distance) % nodeCount;
                
                if (start !== end && !graph.edges.some(e => 
                    (e.from === start && e.to === end) || (e.from === end && e.to === start))) {
                    addEdge(start, end, Math.floor(Math.random() * 3) + 1); // Very low weight
                }
            }

            // 3. Fill remaining edges, prioritizing cycle creation
            let attempts = 0;
            while (graph.edges.length < targetEdges && attempts < 500) {
                const u = Math.floor(Math.random() * nodeCount);
                const v = Math.floor(Math.random() * nodeCount);
                
                if (u !== v && !graph.edges.some(e => 
                    (e.from === u && e.to === v) || (e.from === v && e.to === u))) {
                    
                    // Check if this would create a cycle
                    let createsCycle = false;
                    
                    // Simple connectivity check using BFS
                    const visited = new Set();
                    const queue = [u];
                    visited.add(u);
                    
                    while (queue.length > 0) {
                        const current = queue.shift();
                        graph.edges.forEach(edge => {
                            if (edge.from === current && !visited.has(edge.to)) {
                                if (edge.to === v) createsCycle = true;
                                visited.add(edge.to);
                                queue.push(edge.to);
                            } else if (edge.to === current && !visited.has(edge.from)) {
                                if (edge.from === v) createsCycle = true;
                                visited.add(edge.from);
                                queue.push(edge.from);
                            }
                        });
                    }
                    
                    // Assign weight: very low if it creates cycle, random otherwise
                    const weight = createsCycle ? 
                        Math.floor(Math.random() * 5) + 1 : // 1-5 for cycle edges
                        Math.floor(Math.random() * 15) + 10; // 10-24 for non-cycle
                    
                    addEdge(u, v, weight);
                }
                attempts++;
            }

            // 4. FINAL GUARANTEE: Add at least 3 very low-weight cycle edges if not enough
            let lowWeightCycleCount = graph.edges.filter(edge => 
                edge.weight <= 5 && 
                // Verify it actually creates a cycle
                (() => {
                    const tempEdges = graph.edges.filter(e => e !== edge);
                    const visited = new Set();
                    const stack = [edge.from];
                    visited.add(edge.from);
                    let connects = false;
                    
                    while (stack.length > 0 && !connects) {
                        const current = stack.pop();
                        tempEdges.forEach(e => {
                            if (e.from === current && !visited.has(e.to)) {
                                if (e.to === edge.to) connects = true;
                                visited.add(e.to);
                                stack.push(e.to);
                            } else if (e.to === current && !visited.has(e.from)) {
                                if (e.from === edge.to) connects = true;
                                visited.add(e.from);
                                stack.push(e.from);
                            }
                        });
                    }
                    return connects;
                })()
            ).length;

            while (lowWeightCycleCount < 3) {
                // Find and add more low-weight cycle edges
                for (let i = 0; i < nodeCount && lowWeightCycleCount < 3; i++) {
                    for (let j = i + 2; j < nodeCount && lowWeightCycleCount < 3; j++) {
                        if (!graph.edges.some(e => (e.from === i && e.to === j) || (e.from === j && e.to === i))) {
                            // Check connectivity
                            const visited = new Set();
                            const stack = [i];
                            visited.add(i);
                            let connected = false;
                            
                            while (stack.length > 0 && !connected) {
                                const current = stack.pop();
                                graph.edges.forEach(edge => {
                                    if (edge.from === current && !visited.has(edge.to)) {
                                        if (edge.to === j) connected = true;
                                        visited.add(edge.to);
                                        stack.push(edge.to);
                                    } else if (edge.to === current && !visited.has(edge.from)) {
                                        if (edge.from === j) connected = true;
                                        visited.add(edge.from);
                                        stack.push(edge.from);
                                    }
                                });
                            }
                            
                            if (connected) {
                                addEdge(i, j, Math.floor(Math.random() * 3) + 1);
                                lowWeightCycleCount++;
                                break;
                            }
                        }
                    }
                }
                break; // Safety break
            }

            showToast(`Guaranteed cycle graph ready!`, 'success');
        } else if (type === 'complete') {
            for (let i = 0; i < nodeCount; i++) {
                for (let j = i + 1; j < nodeCount; j++) {
                    addEdge(i, j, Math.floor(Math.random() * 20) + 1);
                }
            }
            showToast('Complete graph generated. Edge Density is 100%.', 'info');
        }
        
        updateUIAfterGraphChange();
        showToast(`Generated a new '${type}' graph.`, 'success');
    }

    // --- DRAWING & UI ---
    function setCanvasSize() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawGraph();
    }

    function drawGraph() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        graph.edges.forEach(edge => {
            const fromNode = graph.nodes.find(n => n.id === edge.from);
            const toNode = graph.nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return;

            ctx.beginPath();
            ctx.moveTo(fromNode.x, fromNode.y);
            ctx.lineTo(toNode.x, toNode.y);
            
            const isInvalid = state.invalidEdges.includes(edge);
            const isConsidering = state.consideringEdge === edge;

            if (edge.isInMST) { ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 4; }
            else if (isInvalid) { ctx.strokeStyle = '#f44336'; ctx.lineWidth = 4; }
            else if (isConsidering) { ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 4; }
            else { ctx.strokeStyle = '#9C27B0'; ctx.lineWidth = 2; }
            
            ctx.stroke();
            
            const midX = (fromNode.x + toNode.x) / 2;
            const midY = (fromNode.y + toNode.y) / 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(midX - 15, midY - 12, 30, 24);
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(edge.weight, midX, midY);
        });
        
        graph.nodes.forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
            ctx.fillStyle = state.visitedNodes.has(node.id) ? '#4CAF50' : '#FF5722';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(node.label, node.x, node.y);
        });
        
        updateDataStructuresUI();
        updateStatsUI();
    }
    
    function initializeEventListeners() {
        document.querySelectorAll('.algorithm-btn').forEach(btn => btn.addEventListener('click', (e) => {
            if (state.algorithmLocked) return;
            document.querySelectorAll('.algorithm-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            updateAlgorithmUI();
            resetAnimationState(false);
        }));

        document.getElementById('nodeCount').addEventListener('input', e => {
            document.getElementById('nodeCountValue').textContent = e.target.value;
            updateEdgeDensityForGraphType(); // ADD THIS LINE
        });
        document.getElementById('edgeDensity').addEventListener('input', e => document.getElementById('edgeDensityValue').textContent = e.target.value + '%');
        document.getElementById('animationSpeed').addEventListener('input', e => {
            const speedLabels = ['Very Slow', 'Slow', 'Medium', 'Fast', 'Very Fast'];
            document.getElementById('animationSpeedValue').textContent = speedLabels[Math.floor((e.target.value - 1) / 2)];
            state.speed = parseInt(e.target.value);
            if (state.isRunning && state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = setInterval(animateStep, getAnimationDelay());
            }
        });

        document.getElementById('generateGraph').addEventListener('click', generateGraph);
        document.getElementById('visualize').addEventListener('click', startVisualization);
        document.getElementById('reset').addEventListener('click', resetFull);
        
        document.getElementById('stepForward').addEventListener('click', stepForward);
        document.getElementById('stepBackward').addEventListener('click', stepBackward);
        document.getElementById('pauseResume').addEventListener('click', togglePauseResume);

        document.getElementById('graphTypeSelect').addEventListener('change', (e) => {
            updateEdgeDensityForGraphType();
            updateAlgorithmUI();
        });

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
    }

    function updateAlgorithmUI() {
        const selectedAlgo = document.querySelector('.algorithm-btn.active').dataset.algo;
        const primInfo = document.getElementById('primInfoSection');
        const kruskalInfo = document.getElementById('kruskalInfoSection');

        primInfo.style.display = selectedAlgo === 'prim' ? 'block' : 'none';
        kruskalInfo.style.display = selectedAlgo === 'kruskal' ? 'block' : 'none';

        document.getElementById('dsTitle').textContent = selectedAlgo === 'prim' ? 'Priority Queue' : 'Disjoint Sets';
        document.getElementById('visitedTitle').textContent = selectedAlgo === 'prim' ? 'Visited Nodes' : 'Sorted Edges';
        document.getElementById('primOptions').style.display = selectedAlgo === 'prim' ? 'flex' : 'none';
    }
    
    function updateUIAfterGraphChange() {
        const startNodeSelect = document.getElementById('startNodeSelect');
        startNodeSelect.innerHTML = '';
        graph.nodes.sort((a,b) => a.id - b.id).forEach(node => {
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = `Node ${node.label}`;
            startNodeSelect.appendChild(option);
        });
        drawGraph();
    }

    function updateStatsUI() {
        document.getElementById('totalNodes').textContent = graph.nodes.length;
        document.getElementById('totalEdges').textContent = graph.edges.length;
        document.getElementById('mstWeight').textContent = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
    }

    function updateDataStructuresUI() {
        const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
        const pqContent = document.getElementById('priorityQueueContent');
        const visitedContent = document.getElementById('visitedNodesContent');
        const mstContent = document.getElementById('mstEdgesContent');
        
        pqContent.innerHTML = '';
        visitedContent.innerHTML = '';
        mstContent.innerHTML = '';

        if (selectedAlgorithm === 'prim') {
            if (state.priorityQueue.length === 0) pqContent.innerHTML = '<div class="queue-item">Empty</div>';
            else state.priorityQueue.forEach(item => {
                const fromLabel = graph.nodes.find(n => n.id === item.edge.from)?.label || '?';
                const toLabel = graph.nodes.find(n => n.id === item.edge.to)?.label || '?';
                pqContent.innerHTML += `<div class="queue-item">${fromLabel}-${toLabel} (${item.edge.weight})</div>`;
            });
            
            Array.from(state.visitedNodes).sort((a,b) => a-b).forEach(nodeId => {
                const nodeLabel = graph.nodes.find(n => n.id === nodeId)?.label || '?';
                visitedContent.innerHTML += `<div class="ds-item">${nodeLabel}</div>`;
            });
        } else { // Kruskal
            if (state.disjointSets.length === 0) pqContent.innerHTML = '<div class="queue-item">Empty</div>';
            else state.disjointSets.forEach((set, i) => {
                const setLabels = set.map(id => graph.nodes.find(n => n.id === id)?.label || '?').join(', ');
                pqContent.innerHTML += `<div class="ds-item component">Set ${i}: {${setLabels}}</div>`;
            });

            if (state.sortedEdges && state.sortedEdges.length > 0) state.sortedEdges.forEach(edge => {
                const fromLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
                const toLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';
                visitedContent.innerHTML += `<div class="ds-item">${fromLabel}-${toLabel} (${edge.weight})</div>`;
            });
            else visitedContent.innerHTML = '<div class="queue-item">Empty</div>';
        }

        graph.mstEdges.forEach(edge => {
            const fromLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
            const toLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';
            mstContent.innerHTML += `<div class="ds-item mst">${fromLabel}-${toLabel} (${edge.weight})</div>`;
        });
    }

    function updateAnimationControls() {
        const hasSteps = state.steps.length > 0;
        const isAtStart = state.currentStep === 0;
        const isAtEnd = state.currentStep >= state.totalSteps;
        
        document.getElementById('stepBackward').disabled = !hasSteps || isAtStart || state.isRunning;
        document.getElementById('stepForward').disabled = !hasSteps || isAtEnd || state.isRunning;
        document.getElementById('pauseResume').disabled = !hasSteps || isAtEnd;
        document.getElementById('visualize').disabled = state.isRunning;
        document.querySelectorAll('.algorithm-btn, #generateGraph, #graphTypeSelect, #nodeCount, #edgeDensity').forEach(el => el.disabled = state.algorithmLocked);

        if (state.isRunning) {
            document.getElementById('pauseResume').textContent = 'Pause';
            document.getElementById('animationStatus').textContent = `Running (Step ${state.currentStep + 1}/${state.totalSteps})`;
        } else {
            document.getElementById('pauseResume').textContent = 'Resume';
            document.getElementById('animationStatus').textContent = hasSteps && !isAtEnd ? `Paused (Step ${state.currentStep}/${state.totalSteps})` : 'Ready to visualize';
        }
    }

    // --- STATE MANAGEMENT & RESETS ---
    function resetFull() {
        if (state.intervalId) clearInterval(state.intervalId);
        graph = { nodes: [], edges: [], mstEdges: [] };
        resetAnimationState(true);
        updateUIAfterGraphChange();
    }

    function resetAnimationState(fullReset) {
        if (state.intervalId) clearInterval(state.intervalId);
        state.isRunning = false;
        state.currentStep = 0;
        state.totalSteps = 0;
        state.steps = [];
        state.algorithmLocked = false;
        state.consideringEdge = null;
        state.invalidEdges = [];
        state.priorityQueue = [];
        state.visitedNodes = new Set();
        state.disjointSets = [];
        state.sortedEdges = null;

        graph.edges.forEach(edge => edge.isInMST = false);
        graph.mstEdges = [];

        if (fullReset) {
            document.getElementById('algorithm-steps-panel').innerHTML = 'Generate a graph, then click "Visualize" to see the steps here.';
        }
        
        updateAnimationControls();
        drawGraph();
    }
    
    // --- EVENT HANDLERS & HELPERS ---
    function handleMouseDown(e) {
        const { x, y } = getMousePos(e);
        const clickedNode = getNodeAt(x, y);
        if (clickedNode && !state.algorithmLocked) {
            state.draggingNode = clickedNode;
            state.dragOffset = { x: x - clickedNode.x, y: y - clickedNode.y };
        }
    }

    function handleMouseMove(e) {
        if (state.draggingNode) {
            const { x, y } = getMousePos(e);
            state.draggingNode.x = x - state.dragOffset.x;
            state.draggingNode.y = y - state.dragOffset.y;
            drawGraph();
        }
    }

    function handleMouseUp() {
        state.draggingNode = null;
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function getNodeAt(x, y) {
        return graph.nodes.find(node => Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2) <= 20);
    }
    
    function togglePauseResume() {
        if (state.isRunning) {
            clearInterval(state.intervalId);
            state.intervalId = null;
            state.isRunning = false;
        } else if (state.currentStep < state.totalSteps) {
            state.isRunning = true;
            state.intervalId = setInterval(animateStep, getAnimationDelay());
        }
        updateAnimationControls();
    }
    
    function stepForward() {
        if (state.currentStep < state.totalSteps) {
            if (state.isRunning) { clearInterval(state.intervalId); state.isRunning = false; }
            executeStep(state.currentStep);
            state.currentStep++;
            updateAnimationControls();
        }
    }

    // In the stepBackward function, replace the existing function with this:
    function stepBackward() {
        if (state.currentStep > 0) {
            if (state.isRunning) { 
                clearInterval(state.intervalId); 
                state.isRunning = false; 
            }
            state.currentStep--;
            
            // Reset the graph to initial state
            graph.edges.forEach(edge => edge.isInMST = false);
            graph.mstEdges = [];
            state.priorityQueue = [];
            state.visitedNodes = new Set();
            state.disjointSets = [];
            state.sortedEdges = null;
            state.consideringEdge = null;
            state.invalidEdges = [];
            
            // Replay all steps up to the previous one
            for (let i = 0; i < state.currentStep; i++) {
                const step = state.steps[i];
                if (step.action === 'addEdge') {
                    const edge = graph.edges.find(e => 
                        (e.from === step.edge.from && e.to === step.edge.to) || 
                        (e.from === step.edge.to && e.to === step.edge.from)
                    );
                    if (edge && !edge.isInMST) {
                        edge.isInMST = true;
                        graph.mstEdges.push(edge);
                    }
                }
                
                if (step.priorityQueue) state.priorityQueue = step.priorityQueue;
                if (step.visitedNodes) state.visitedNodes = new Set(step.visitedNodes);
                if (step.disjointSets) state.disjointSets = step.disjointSets;
                if (step.sortedEdges) state.sortedEdges = step.sortedEdges;
            }
            
            // Execute the previous step to show the correct state
            if (state.currentStep > 0) {
                const prevStep = state.steps[state.currentStep - 1];
                document.getElementById('algorithm-steps-panel').innerHTML = prevStep.description;
                
                if (prevStep.action === 'considerEdge') {
                    state.consideringEdge = prevStep.edge;
                } else if (prevStep.action === 'showInvalid') {
                    state.invalidEdges = prevStep.invalidEdges || [];
                }
            } else {
                document.getElementById('algorithm-steps-panel').innerHTML = 'Stepped back to the beginning. Ready to visualize.';
            }
            
            drawGraph();
            updateAnimationControls();
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            // Remove the element after the transition is complete
            setTimeout(() => toast.remove(), 500); 
        }, 3000);
    }

    function getAnimationDelay() { return 2200 - (state.speed * 200); }
    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

    updateEdgeDensityForGraphType();

});
