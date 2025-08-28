let sheets=[];
let currentSheet=0;
let undoStack=[];
let redoStack=[];
let selectedCells=[];
let clipboard=null;
let contextTarget=null;

function init(){
    if(!sheets.length) addSheet();
    document.addEventListener('click',()=>document.getElementById('contextMenu').style.display='none');
    document.addEventListener('contextmenu', e=>e.preventDefault());
}

function addSheet(){
    const name='Sheet'+(sheets.length+1);
    sheets.push({name,data:Array.from({length:20},()=>Array(10).fill('')),format:{}});
    updateSheetSelector();
    switchSheet(sheets.length-1);
}

function updateSheetSelector(){
    const sel=document.getElementById('sheetSelector');
    sel.innerHTML='';
    sheets.forEach((s,i)=>{
        const option=document.createElement('option');
        option.value=i;
        option.innerText=s.name;
        sel.appendChild(option);
    });
    sel.value=currentSheet;
}

function switchSheet(index){currentSheet=parseInt(index);renderSheet();}

function renderSheet(){
    const sheet=document.getElementById('sheet');
    sheet.innerHTML='';
    const data=sheets[currentSheet].data;

    // Header row
    const header=sheet.insertRow();
    const corner=header.insertCell();
    corner.contentEditable=true;
    corner.innerText="Sheet"; // Top-left intersection editable
    for(let c=0;c<data[0].length;c++){const cell=header.insertCell();cell.innerText=String.fromCharCode(65+c);cell.style.fontWeight='bold';}

    for(let r=0;r<data.length;r++){
        const row=sheet.insertRow();
        const rowHeader=row.insertCell();
        rowHeader.innerText=r+1;
        rowHeader.style.fontWeight='bold';
        for(let c=0;c<data[r].length;c++){
            const cell=row.insertCell();
            cell.contentEditable=true;
            cell.dataset.r=r; cell.dataset.c=c;
            applyCellFormat(cell,r,c);
            cell.innerText=data[r][c];
            cell.addEventListener('input',e=>{saveUndo();data[r][c]=e.target.innerText;evalSheet();});
            cell.addEventListener('mousedown',()=>{selectCell(r,c,true);});
            cell.addEventListener('mouseover',e=>{if(e.buttons===1) selectCell(r,c,false);});
            cell.addEventListener('contextmenu', e=>{e.preventDefault();contextTarget={r,c};showContext(e);});
        }
    }
    evalSheet();
}

function renameSheet() {
    const newName = document.getElementById('sheetNameInput').value.trim();
    if (newName) {
        saveUndo();
        sheets[currentSheet].name = newName;
        updateSheetSelector();
    }
}

function updateSheetSelector() {
    const sel = document.getElementById('sheetSelector');
    sel.innerHTML = '';
    sheets.forEach((s, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.innerText = s.name;
        sel.appendChild(option);
    });
    sel.value = currentSheet;
    document.getElementById('sheetNameInput').value = sheets[currentSheet].name;
}

function switchSheet(index) {
    currentSheet = parseInt(index);
    renderSheet();
    document.getElementById('sheetNameInput').value = sheets[currentSheet].name;
}

function saveSheet() {
    localStorage.setItem('ultimateWebSheets', JSON.stringify(sheets));
    alert('Saved!');
}

function loadSheet() {
    const data = localStorage.getItem('ultimateWebSheets');
    if (data) {
        sheets = JSON.parse(data);
        currentSheet = 0; // Reset to the first sheet
        updateSheetSelector();
        renderSheet();
        alert('Loaded!');
    }
}

function saveUndo(){undoStack.push(JSON.stringify(sheets));redoStack=[];}
function undo(){if(!undoStack.length) return;redoStack.push(JSON.stringify(sheets));sheets=JSON.parse(undoStack.pop());renderSheet();}
function redo(){if(!redoStack.length) return;undoStack.push(JSON.stringify(sheets));sheets=JSON.parse(redoStack.pop());renderSheet();}
function addRow(){saveUndo();sheets[currentSheet].data.push(Array(sheets[currentSheet].data[0].length).fill(''));renderSheet();}
function addColumn(){saveUndo();sheets[currentSheet].data.forEach(row=>row.push(''));renderSheet();}

function calculateFormula(formula,data){
    formula=formula.toUpperCase();
    formula=formula.replace(/[A-Z]+[0-9]+/g,ref=>{const col=ref.charCodeAt(0)-65;const row=parseInt(ref.slice(1))-1;let val=data[row]?.[col]||0;return isNaN(val)?0:val;});
    try{
        formula=formula.replace(/SUM\(([^)]+)\)/g,(m,a)=>a.split(',').reduce((s,c)=>{c=c.trim();const col=c.charCodeAt(0)-65;const row=parseInt(c.slice(1))-1;return s+Number(data[row]?.[col]||0)},0));
        formula=formula.replace(/AVERAGE\(([^)]+)\)/g,(m,a)=>{const cells=a.split(',');return cells.reduce((s,c)=>{c=c.trim();const col=c.charCodeAt(0)-65;const row=parseInt(c.slice(1))-1;return s+Number(data[row]?.[col]||0)},0)/cells.length;});
        formula=formula.replace(/MIN\(([^)]+)\)/g,(m,a)=>Math.min(...a.split(',').map(c=>{c=c.trim();const col=c.charCodeAt(0)-65;const row=parseInt(c.slice(1))-1;return Number(data[row]?.[col]||0);})));
        formula=formula.replace(/MAX\(([^)]+)\)/g,(m,a)=>Math.max(...a.split(',').map(c=>{c=c.trim();const col=c.charCodeAt(0)-65;const row=parseInt(c.slice(1))-1;return Number(data[row]?.[col]||0);})));
        formula=formula.replace(/IF\(([^,]+),([^,]+),([^)]+)\)/g,(m,c1,c2,c3)=>Number(c1)?Number(c2):Number(c3));
        formula=formula.replace(/NOW\(\)/g,`'${new Date().toLocaleString()}'`);
        formula=formula.replace(/TODAY\(\)/g,`'${new Date().toLocaleDateString()}'`);
        formula=formula.replace(/RAND\(\)/g,Math.random());
        return Function('"use strict";return('+formula+')')();
    }catch{return '#ERROR';}
}

function evalSheet(){const data=sheets[currentSheet].data;const sheet=document.getElementById('sheet');for(let r=0;r<data.length;r++){for(let c=0;c<data[r].length;c++){const cell=sheet.rows[r+1].cells[c+1];let val=data[r][c];if(val.startsWith('=')){cell.innerText=calculateFormula(val.slice(1),data);}}}}

function saveSheet(){localStorage.setItem('styledWebSheets',JSON.stringify(sheets));alert('Saved!');}
function loadSheet(){const data=localStorage.getItem('styledWebSheets');if(data){sheets=JSON.parse(data);currentSheet=0;updateSheetSelector();renderSheet();alert('Loaded!');}}

function selectCell(r,c,newSel){if(newSel) selectedCells=[];selectedCells.push({r,c});renderSheet();for(let {r:cR,c:cC} of selectedCells)document.getElementById('sheet').rows[cR+1].cells[cC+1].classList.add('selected');}
function formatSelected(type,value){saveUndo();for(let {r,c} of selectedCells){sheets[currentSheet].format[`${r},${c}`]=sheets[currentSheet].format[`${r},${c}`]||{};if(type==='bold')sheets[currentSheet].format[`${r},${c}`].bold=!sheets[currentSheet].format[`${r},${c}`].bold;if(type==='italic')sheets[currentSheet].format[`${r},${c}`].italic=!sheets[currentSheet].format[`${r},${c}`].italic;if(type==='bg')sheets[currentSheet].format[`${r},${c}`].bg=value;if(type==='color')sheets[currentSheet].format[`${r},${c}`].color=value;}renderSheet();}
function applyCellFormat(cell,r,c){const fmt=sheets[currentSheet].format[`${r},${c}`];if(!fmt) return;cell.style.fontWeight=fmt.bold?'bold':'normal';cell.style.fontStyle=fmt.italic?'italic':'normal';cell.style.backgroundColor=fmt.bg||'';cell.style.color=fmt.color||'';}

function showContext(e){const menu=document.getElementById('contextMenu');menu.style.display='block';menu.style.left=e.pageX+'px';menu.style.top=e.pageY+'px';}
function insertRow(){if(contextTarget){saveUndo();sheets[currentSheet].data.splice(contextTarget.r,0,Array(sheets[currentSheet].data[0].length).fill(''));renderSheet();}}
function deleteRow(){if(contextTarget){saveUndo();sheets[currentSheet].data.splice(contextTarget.r,1);renderSheet();}}
function insertColumn(){if(contextTarget){saveUndo();sheets[currentSheet].data.forEach(r=>r.splice(contextTarget.c,0,''));renderSheet();}}
function deleteColumn(){if(contextTarget){saveUndo();sheets[currentSheet].data.forEach(r=>r.splice(contextTarget.c,1));renderSheet();}}
function cutCells(){if(selectedCells.length){clipboard=[];selectedCells.forEach(({r,c})=>{clipboard.push({r,c,value:sheets[currentSheet].data[r][c]});sheets[currentSheet].data[r][c]='';});renderSheet();}}
function copyCells(){if(selectedCells.length){clipboard=[];selectedCells.forEach(({r,c})=>{clipboard.push({r,c,value:sheets[currentSheet].data[r][c]});});}}
function pasteCells(){if(clipboard){saveUndo();clipboard.forEach(({r,c,value})=>{sheets[currentSheet].data[r][c]=value;});renderSheet();}}

init();
