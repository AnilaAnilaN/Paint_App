document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('statusText');
    const canvasContainer = document.querySelector('.canvas-container');
    const overlay = document.getElementById('overlay');
    const brushPreview = document.getElementById('brushPreview');
    const colorPreview = document.getElementById('colorPreview');
    const bgImageInput = document.getElementById('bgImageInput');

    // State
    let isDrawing = false;
    let currentTool = 'pencil';
    let currentColor = '#4f46e5';
    let currentSize = 2;
    let startX, startY;
    let snapshot = null;
    let currentShape = null;
    let drawingHistory = [];
    let historyIndex = -1;
    let textInput = null;
    let isBackgroundSet = false;

    // Initialize canvas
    function initCanvas() {
        // Set canvas to container dimensions
        canvas.width = canvasContainer.clientWidth;
        canvas.height = canvasContainer.clientHeight;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = currentColor;
        ctx.fillStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    
    initCanvas();

    // Resize canvas
    function resizeCanvas() {
        const prevWidth = canvas.width;
        const prevHeight = canvas.height;
        
        // Save current canvas content
        const imageData = ctx.getImageData(0, 0, prevWidth, prevHeight);
        
        // Set new dimensions
        canvas.width = canvasContainer.clientWidth;
        canvas.height = canvasContainer.clientHeight;
        
        // Restore content
        ctx.putImageData(imageData, 0, 0);
    }
    
    window.addEventListener('resize', resizeCanvas);

    // Tool selection
    document.querySelectorAll('.tool').forEach(tool => {
        tool.addEventListener('click', () => {
            document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
            tool.classList.add('active');
            currentTool = tool.dataset.tool;

            // Close panels when selecting other tools
            if (currentTool === 'shapes') {
                document.getElementById('shapePanel').style.display = 'flex';
                saveCanvasState();
            } else {
                document.getElementById('shapePanel').style.display = 'none';
            }
            
            if (currentTool === 'picker') {
                document.getElementById('colorPicker').style.display = 'flex';
            } else {
                document.getElementById('colorPicker').style.display = 'none';
            }

            // Handle undo/redo
            if (currentTool === 'undo') {
                undo();
                // Keep undo tool active after operation
                tool.classList.add('active');
            } else if (currentTool === 'redo') {
                redo();
                tool.classList.add('active');
            }

            updateStatus(`Selected: ${tool.querySelector('.tool-label').textContent}`);
        });
    });

    // Shape selection
    document.querySelectorAll('.shape-btn').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.shape-btn').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentShape = item.dataset.shape;
            updateStatus(`Shape: ${currentShape}`);
        });
    });

    // Background button - directly trigger file input
    document.getElementById('bgBtn').addEventListener('click', () => {
        bgImageInput.click();
    });

    // Handle background image upload
    bgImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.match('image.*')) {
            alert('Please select an image file (JPEG, PNG, etc.)');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Clear canvas and draw the image
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                saveCanvasState();
                updateStatus('Background image set');
                isBackgroundSet = true;
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Brush size
    const brushSlider = document.getElementById('brushSlider');
    document.getElementById('brushSizeBtn').addEventListener('click', () => {
        brushSlider.style.display = brushSlider.style.display === 'flex' ? 'none' : 'flex';
    });
    
    const brushSizeRange = document.getElementById('brushSizeRange');
    brushSizeRange.addEventListener('input', (e) => {
        currentSize = parseInt(e.target.value);
        ctx.lineWidth = currentSize;
        brushPreview.textContent = currentSize;
        brushPreview.style.width = `${currentSize * 2}px`;
        brushPreview.style.height = `${currentSize * 2}px`;
        updateStatus(`Brush size: ${currentSize}px`);
    });

    // Color modal
    const colorModal = document.getElementById('colorModal');
    document.getElementById('colorBtn').addEventListener('click', () => {
        colorModal.style.display = 'flex';
        overlay.style.display = 'block';
    });
    document.getElementById('closeColorModal').addEventListener('click', () => {
        colorModal.style.display = 'none';
        overlay.style.display = 'none';
    });
    overlay.addEventListener('click', () => {
        colorModal.style.display = 'none';
        overlay.style.display = 'none';
    });
    
    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    const colorPickerInput = document.getElementById('colorPickerInput');
    colorPickerInput.addEventListener('input', (e) => {
        currentColor = e.target.value;
        ctx.strokeStyle = currentColor;
        ctx.fillStyle = currentColor;
        colorPreview.style.backgroundColor = currentColor;
        updateStatus(`Selected color: ${currentColor}`);
    });

    // Toolbar toggle
    document.getElementById('toolbarToggle').addEventListener('click', () => {
        const toolbar = document.getElementById('toolbar');
        toolbar.classList.toggle('active');
        
        if (window.innerWidth <= 992) {
            const toggleBtn = document.getElementById('toolbarToggle');
            const toggleRect = toggleBtn.getBoundingClientRect();
            
            // Position toolbar above the toggle button
            toolbar.style.bottom = `${window.innerHeight - toggleRect.top + 10}px`;
            toolbar.style.left = '0';
            toolbar.style.right = '0';
        }
    });

    // Canvas events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);

    // Button events
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    document.getElementById('saveBtn').addEventListener('click', () => downloadCanvas('png'));
    document.getElementById('downloadPng').addEventListener('click', () => downloadCanvas('png'));
    document.getElementById('downloadJpeg').addEventListener('click', () => downloadCanvas('jpeg'));

    // Functions
    function updateStatus(message) {
        statusText.textContent = message;
    }

    function saveCanvasState() {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Only save if something has changed
        if (historyIndex === -1 || !isCanvasStateEqual(imageData, drawingHistory[historyIndex])) {
            // If we're not at the end of history, remove future states
            if (historyIndex < drawingHistory.length - 1) {
                drawingHistory = drawingHistory.slice(0, historyIndex + 1);
            }
            
            drawingHistory.push(imageData);
            historyIndex = drawingHistory.length - 1;
        }
    }

    function isCanvasStateEqual(a, b) {
        if (!a || !b || a.data.length !== b.data.length) return false;
        for (let i = 0; i < a.data.length; i++) {
            if (a.data[i] !== b.data[i]) return false;
        }
        return true;
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            ctx.putImageData(drawingHistory[historyIndex], 0, 0);
            updateStatus('Undo successful');
        } else {
            updateStatus('Nothing to undo');
        }
    }
    
    function redo() {
        if (historyIndex < drawingHistory.length - 1) {
            historyIndex++;
            ctx.putImageData(drawingHistory[historyIndex], 0, 0);
            updateStatus('Redo successful');
        } else {
            updateStatus('Nothing to redo');
        }
    }

    function startDrawing(e) {
        isDrawing = true;
        const coords = getCoordinates(e);
        startX = Math.round(coords.x);
        startY = Math.round(coords.y);

        if (currentTool !== 'bucket' && currentTool !== 'text' && currentTool !== 'picker') {
            saveCanvasState();
        }

        if (currentTool === 'text') {
            createTextInput(coords.x, coords.y);
            isDrawing = false;
        } else if (currentTool === 'bucket') {
            floodFill(startX, startY, currentColor);
            isDrawing = false;
            updateStatus('Area filled');
        } else if (currentTool === 'shapes') {
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } else if (currentTool === 'picker') {
            const pixelData = ctx.getImageData(startX, startY, 1, 1).data;
            const color = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
            currentColor = rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
            ctx.strokeStyle = currentColor;
            ctx.fillStyle = currentColor;
            colorPickerInput.value = currentColor;
            colorPreview.style.backgroundColor = currentColor;
            updateStatus(`Color picked: ${color}`);
            isDrawing = false;
        } else {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            if (currentTool === 'pencil') ctx.globalAlpha = 1.0;
            else if (currentTool === 'brush') ctx.globalAlpha = 0.7;
        }
    }

    function draw(e) {
        if (!isDrawing) return;

        if (currentTool === 'eraser') ctx.strokeStyle = 'white';
        else ctx.strokeStyle = currentColor;

        ctx.fillStyle = currentColor;
        ctx.lineWidth = currentSize;

        const coords = getCoordinates(e);
        const x = Math.round(coords.x);
        const y = Math.round(coords.y);

        if (currentTool === 'shapes' && currentShape) {
            ctx.putImageData(snapshot, 0, 0);
            switch (currentShape) {
                case 'line':
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    break;
                case 'rectangle':
                    ctx.strokeRect(startX, startY, x - startX, y - startY);
                    break;
                case 'circle':
                    const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
                    ctx.beginPath();
                    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case 'oval':
                    drawOval(startX, startY, x - startX, y - startY);
                    break;
                case 'triangle':
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(x, y);
                    ctx.lineTo(startX * 2 - x, y);
                    ctx.closePath();
                    ctx.stroke();
                    break;
                case 'heart':
                    drawHeart(startX, startY, x, y);
                    break;
            }
        } else if (currentTool === 'spray') {
            spray(x, y);
        } else {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }

    function stopDrawing() {
        if (isDrawing) {
            isDrawing = false;
            ctx.globalAlpha = 1.0;
            if (currentTool !== 'shapes') ctx.beginPath();
            
            // Save state after drawing is complete
            if (currentTool !== 'picker') {
                saveCanvasState();
            }
        }
    }

    function createTextInput(x, y) {
        if (textInput) textInput.remove();

        textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'text-input';
        textInput.placeholder = 'Type here...';

        const rect = canvas.getBoundingClientRect();
        const screenX = rect.left + x;
        const screenY = rect.top + y;

        textInput.style.left = `${screenX}px`;
        textInput.style.top = `${screenY}px`;
        document.body.appendChild(textInput);
        textInput.focus();

        let isDragging = false;
        let offsetX, offsetY;

        textInput.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - textInput.offsetLeft;
            offsetY = e.clientY - textInput.offsetTop;
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                textInput.style.left = `${e.clientX - offsetX}px`;
                textInput.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && textInput.value) {
                const newRect = canvas.getBoundingClientRect();
                const finalX = textInput.offsetLeft - newRect.left;
                const finalY = textInput.offsetTop - newRect.top + textInput.offsetHeight;

                saveCanvasState();
                ctx.font = `${currentSize * 5}px Arial`;
                ctx.fillStyle = currentColor;
                ctx.fillText(textInput.value, finalX, finalY);
                textInput.remove();
                textInput = null;
                updateStatus('Text added');
            }
        });

        document.addEventListener('click', (e) => {
            if (textInput && !textInput.contains(e.target) && e.target !== canvas) {
                textInput.remove();
                textInput = null;
            }
        }, { once: true });
    }

    function drawOval(x, y, width, height) {
        ctx.save();
        ctx.beginPath();
        ctx.translate(x + width / 2, y + height / 2);
        ctx.scale(width / 2, height / 2);
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
        ctx.stroke();
    }

    function drawHeart(x, y, endX, endY) {
        const dx = endX - x;
        const dy = endY - y;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        const fontSize = Math.max(10, size * 1.5);
        ctx.font = `${fontSize}px Arial`;
        ctx.fillText('❤️', x, y);
    }

    function spray(x, y) {
        ctx.fillStyle = currentColor;
        const density = currentSize * 2;
        for (let i = 0; i < density; i++) {
            const radius = Math.random() * currentSize * 2;
            const angle = Math.random() * Math.PI * 2;
            const sprayX = x + Math.cos(angle) * radius;
            const sprayY = y + Math.sin(angle) * radius;
            ctx.beginPath();
            ctx.arc(sprayX, sprayY, currentSize / 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Enhanced flood fill algorithm
    function floodFill(startX, startY, fillColor) {
        saveCanvasState();
        
        // Get the color at the starting pixel
        const pixelData = ctx.getImageData(startX, startY, 1, 1).data;
        const targetColor = {
            r: pixelData[0],
            g: pixelData[1],
            b: pixelData[2],
            a: pixelData[3]
        };
        
        // Convert fill color to RGB
        const fillR = parseInt(fillColor.substring(1, 3), 16);
        const fillG = parseInt(fillColor.substring(3, 5), 16);
        const fillB = parseInt(fillColor.substring(5, 7), 16);
        
        // Check if we're already filling with the same color
        if (targetColor.r === fillR && 
            targetColor.g === fillG && 
            targetColor.b === fillB && 
            targetColor.a === 255) {
            return;
        }
        
        // Create a temporary canvas for processing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
        
        // Get image data
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        // Create a visited array to avoid processing the same pixel multiple times
        const visited = new Uint8Array(tempCanvas.width * tempCanvas.height);
        
        // Queue for BFS
        const queue = [[startX, startY]];
        visited[startY * tempCanvas.width + startX] = 1;
        
        // Process the queue
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const idx = (y * tempCanvas.width + x) * 4;
            
            // Check if this pixel matches the target color
            if (data[idx] === targetColor.r && 
                data[idx + 1] === targetColor.g && 
                data[idx + 2] === targetColor.b && 
                data[idx + 3] === targetColor.a) {
                
                // Set the fill color
                data[idx] = fillR;
                data[idx + 1] = fillG;
                data[idx + 2] = fillB;
                data[idx + 3] = 255;
                
                // Check neighbors
                const neighbors = [
                    [x - 1, y], [x + 1, y],
                    [x, y - 1], [x, y + 1]
                ];
                
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < tempCanvas.width && 
                        ny >= 0 && ny < tempCanvas.height) {
                        const nIdx = ny * tempCanvas.width + nx;
                        if (!visited[nIdx]) {
                            visited[nIdx] = 1;
                            queue.push([nx, ny]);
                        }
                    }
                }
            }
        }
        
        // Put the modified image data back to the main canvas
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0);
    }
    
    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function clearCanvas() {
        if (confirm('Clear canvas?')) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawingHistory = [];
            historyIndex = -1;
            isBackgroundSet = false;
            updateStatus('Canvas cleared');
            saveCanvasState();
        }
    }

    function downloadCanvas(format) {
        const link = document.createElement('a');
        link.download = `artify-canvas.${format}`;
        link.href = canvas.toDataURL(`image/${format}`);
        link.click();
        updateStatus(`Saved as ${format.toUpperCase()}`);
    }

    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }

    function handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    }

    function getCoordinates(e) {
        let x, y;
        const rect = canvas.getBoundingClientRect();

        if (e.type.includes('touch')) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        return { x, y };
    }

    // Initialize color modal
    function initializeColorModal() {
        const colorGrid = document.querySelector('.color-grid');
        const colorGroups = [
            {
                name: 'Primary',
                colors: [
                    { color: '#4f46e5', style: 'background: #4f46e5' },
                    { color: '#7c3aed', style: 'background: #7c3aed' },
                    { color: '#2563eb', style: 'background: #2563eb' },
                    { color: '#0ea5e9', style: 'background: #0ea5e9' },
                    { color: '#06b6d4', style: 'background: #06b6d4' },
                    { color: '#10b981', style: 'background: #10b981' }
                ]
            },
            {
                name: 'Accent',
                colors: [
                    { color: '#f97316', style: 'background: #f97316' },
                    { color: '#f59e0b', style: 'background: #f59e0b' },
                    { color: '#eab308', style: 'background: #eab308' },
                    { color: '#84cc16', style: 'background: #84cc16' },
                    { color: '#22c55e', style: 'background: #22c55e' },
                    { color: '#14b8a6', style: 'background: #14b8a6' }
                ]
            },
            {
                name: 'Neutral',
                colors: [
                    { color: '#000000', style: 'background: #000000', active: true },
                    { color: '#ffffff', style: 'background: #ffffff; border: 1px solid #e5e7eb' },
                    { color: '#4b5563', style: 'background: #4b5563' },
                    { color: '#9ca3af', style: 'background: #9ca3af' },
                    { color: '#ef4444', style: 'background: #ef4444' },
                    { color: '#ec4899', style: 'background: #ec4899' }
                ]
            },
            {
                name: 'Pastels',
                colors: [
                    { color: '#fbcfe8', style: 'background: #fbcfe8' },
                    { color: '#c7d2fe', style: 'background: #c7d2fe' },
                    { color: '#bbf7d0', style: 'background: #bbf7d0' },
                    { color: '#fef3c7', style: 'background: #fef3c7' },
                    { color: '#bfdbfe', style: 'background: #bfdbfe' },
                    { color: '#d9f99d', style: 'background: #d9f99d' }
                ]
            }
        ];

        colorGroups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'color-group';
            groupDiv.innerHTML = `<h3>${group.name}</h3>`;
            const colorItems = document.createElement('div');
            colorItems.className = 'color-items';
            
            group.colors.forEach(c => {
                const colorDiv = document.createElement('div');
                colorDiv.className = `color-item ${c.active ? 'active' : ''}`;
                if (c.style) colorDiv.style = c.style;
                colorDiv.dataset.color = c.color;
                colorItems.appendChild(colorDiv);
            });
            
            groupDiv.appendChild(colorItems);
            colorGrid.appendChild(groupDiv);
        });

        colorGrid.querySelectorAll('.color-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.color-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentColor = item.dataset.color;
                ctx.strokeStyle = currentColor;
                ctx.fillStyle = currentColor;
                colorPickerInput.value = currentColor;
                colorPreview.style.backgroundColor = currentColor;
                updateStatus(`Color: ${currentColor}`);
            });
        });
    }

    initializeColorModal();
    updateStatus('Select a tool to start drawing');
    saveCanvasState();
});
