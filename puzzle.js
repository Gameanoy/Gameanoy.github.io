const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('puzzleCanvas');
const pCtx = pCanvas.getContext('2d');

let W, H, scale, frame = 0, isPaused = false, isDead = false, currentLevel = 1;

// --- [CHILL AUDIO ENGINE] ---
const audio = {
    ctx: null,
    init() { if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    playLofi() {
        this.init();
        const loop = () => {
            let t = this.ctx.currentTime;
            this.genNote(220, t, 1.5); // Warm Pad
            this.genNote(164.81, t + 1, 1.5);
            setTimeout(loop, 2000);
        };
        loop();
    },
    genNote(f, t, d) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.5);
        g.gain.linearRampToValueAtTime(0, t + d);
        o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d);
    }
};

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    scale = W / 375;
}
window.addEventListener('resize', resize); resize();

// --- [INPUT] ---
const input = { l: false, r: false };
const setupBtns = (id, k) => {
    const el = document.getElementById(id);
    el.ontouchstart = (e) => { e.preventDefault(); input[k] = true; audio.init(); };
    el.ontouchend = () => input[k] = false;
};
setupBtns('lBtn', 'l'); setupBtns('rBtn', 'r');
document.getElementById('jBtn').ontouchstart = (e) => {
    e.preventDefault(); if(player.grounded && !isDead) { player.vy = player.jumpPower * scale; player.grounded = false; }
};

// --- [SMOOTH ENTITY SYSTEM] ---
class Entity {
    constructor(color, type) {
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.w = 22; this.h = 45; this.color = color;
        this.type = type; // 'player' or 'stalker'
        this.grounded = false; this.dir = 1;
        this.lerpX = 0; this.lerpY = 0;
        this.anim = 0;
        this.speed = type === 'player' ? 4.2 : 1.5; // Stalker ช้าลงตามสั่ง
        this.jumpPower = -12.5;
    }
    update() {
        this.anim += Math.abs(this.vx) * 0.1;
        // Smooth positioning
        this.lerpX += (this.x - this.lerpX) * 0.2;
        this.lerpY += (this.y - this.lerpY) * 0.2;
    }
    draw(camX) {
        ctx.save();
        ctx.translate(this.x - camX + (this.w*scale/2), this.y + (this.h*scale/2));
        
        // Physics-based Lean
        ctx.rotate(this.vx * 0.04);
        ctx.scale(this.dir, 1);

        // Visibility Fix: Stronger Glow for Enemy
        ctx.strokeStyle = this.color; ctx.lineWidth = 4 * scale;
        ctx.shadowBlur = this.type === 'stalker' ? 25 : 15;
        ctx.shadowColor = this.color;

        let walk = Math.sin(this.anim) * 12 * scale;
        let breathe = Math.sin(frame * 0.06) * 2 * scale;

        // Draw Body
        ctx.beginPath(); ctx.arc(0, (-18 + breathe)*scale, 8*scale, 0, 7); ctx.stroke(); // Head
        if(this.type === 'stalker') { // Visible Glowing Eyes
            ctx.fillStyle = "white"; ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.arc(-3*scale, -19*scale, 2*scale, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(3*scale, -19*scale, 2*scale, 0, 7); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(0, -9*scale); ctx.lineTo(0, 10*scale); ctx.stroke(); // Torso
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(walk, 12*scale); ctx.stroke(); // Arm L
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-walk, 12*scale); ctx.stroke(); // Arm R
        ctx.beginPath(); ctx.moveTo(0, 10*scale); ctx.lineTo(walk, 28*scale); ctx.stroke(); // Leg L
        ctx.beginPath(); ctx.moveTo(0, 10*scale); ctx.lineTo(-walk, 28*scale); ctx.stroke(); // Leg R
        ctx.restore();
    }
}

const player = new Entity("#00f2ff", "player");
const stalker = new Entity("#ff3333", "stalker");
const camera = { x: 0, targetX: 0 };
let platforms = [];

// --- [SOLVABLE PUZZLE] ---
let dots = [], connections = [], activePath = null;
function initPuzzle() {
    pCanvas.width = 280; pCanvas.height = 280;
    dots = []; connections = [];
    const pts = [{x:0,y:0},{x:3,y:3},{x:0,y:3},{x:3,y:0},{x:1,y:1},{x:2,y:2}];
    for(let i=0; i<3; i++) {
        let p1 = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
        let p2 = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
        dots.push({id:i, x:p1.x, y:p1.y, c:["#00f2ff","#ff3333","#39ff14"][i]}, 
                  {id:i, x:p2.x, y:p2.y, c:["#00f2ff","#ff3333","#39ff14"][i]});
    }
    renderPuzzle();
}

function renderPuzzle() {
    pCtx.fillStyle="#000"; pCtx.fillRect(0,0,280,280);
    pCtx.strokeStyle="#111";
    for(let i=0; i<=4; i++) { pCtx.moveTo(i*70,0); pCtx.lineTo(i*70,280); pCtx.moveTo(0,i*70); pCtx.lineTo(280,i*70); }
    pCtx.stroke();
    [...connections, activePath].filter(Boolean).forEach(path => {
        pCtx.strokeStyle=path.c; pCtx.lineWidth=14; pCtx.lineCap="round"; pCtx.beginPath();
        path.pts.forEach((p,i) => i===0?pCtx.moveTo(p.x*70+35,p.y*70+35):pCtx.lineTo(p.x*70+35,p.y*70+35));
        pCtx.stroke();
    });
    dots.forEach(d => { pCtx.fillStyle=d.c; pCtx.beginPath(); pCtx.arc(d.x*70+35, d.y*70+35, 18, 0, 7); pCtx.fill(); });
}

pCanvas.ontouchstart = (e) => {
    const r=pCanvas.getBoundingClientRect(), x=Math.floor((e.touches[0].clientX-r.left)/70), y=Math.floor((e.touches[0].clientY-r.top)/70);
    const d=dots.find(dt=>dt.x===x&&dt.y===y); if(d) activePath={id:d.id, c:d.c, pts:[{x,y}]};
};
pCanvas.ontouchmove = (e) => {
    if(!activePath) return;
    const r=pCanvas.getBoundingClientRect(), x=Math.floor((e.touches[0].clientX-r.left)/70), y=Math.floor((e.touches[0].clientY-r.top)/70);
    if(x>=0&&x<4&&y>=0&&y<4) {
        const last=activePath.pts[activePath.pts.length-1];
        if(last.x!==x||last.y!==y) {
            activePath.pts.push({x,y}); renderPuzzle();
            if(dots.find(dt=>dt.x===x&&dt.y===y&&dt.id===activePath.id&&(x!==activePath.pts[0].x||y!==activePath.pts[0].y))) {
                connections.push(activePath); activePath=null; 
                if(connections.length===3) setTimeout(()=>{isPaused=false; currentLevel++; startLevel(currentLevel);},300);
            }
        }
    }
};

// --- [WORLD SYSTEM] ---
function startLevel(lvl) {
    player.x = 60*scale; player.y = 200*scale;
    stalker.x = -150*scale; stalker.y = 200*scale;
    camera.x = 0;
    
    // Beatable Obby Logic
    platforms = [{x:0, y:350, w:300}];
    let curX = 300;
    for(let i=0; i<6; i++) {
        let gap = 110 + Math.random()*50;
        let w = 80 + Math.random()*100;
        platforms.push({x:curX+gap, y:250+Math.random()*120, w:w, troll:lvl>2&&Math.random()>0.8});
        curX += gap + w;
    }
    platforms.push({x:curX+100, y:350, w:3000});

    platforms = platforms.map(p => ({...p, x:p.x*scale, y:p.y*scale, w:p.w*scale, h:40*scale, active:true}));
    document.getElementById('lvl-num').innerText = lvl.toString().padStart(2,'0');
    document.getElementById('puzzle-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    isPaused=false; isDead=false;
}

function update() {
    if(isDead) return;
    frame++;

    // Stalker AI Pathing
    let dx = player.x - stalker.x;
    stalker.vx = Math.sign(dx) * stalker.speed * scale;
    stalker.dir = Math.sign(dx);
    if(stalker.grounded && (player.y < stalker.y - 30)) stalker.vy = stalker.jumpPower * scale;
    stalker.vy += 0.7 * scale; stalker.x += stalker.vx; stalker.y += stalker.vy;
    stalker.update();

    if(!isPaused) {
        if(input.l) { player.vx = -player.speed*scale; player.dir = -1; }
        else if(input.r) { player.vx = player.speed*scale; player.dir = 1; }
        else player.vx *= 0.85;

        player.vy += 0.7 * scale; player.x += player.vx; player.y += player.vy;
        player.update();

        // Collision
        [player, stalker].forEach(ent => {
            ent.grounded = false;
            platforms.forEach(p => {
                if(!p.active) return;
                if(ent.vy > 0 && ent.x + ent.w*scale > p.x && ent.x < p.x + p.w &&
                   ent.y + ent.h*scale > p.y && ent.y + ent.h*scale < p.y + p.h + ent.vy) {
                    ent.y = p.y - ent.h*scale; ent.vy = 0; ent.grounded = true;
                    if(ent===player && p.troll) setTimeout(()=>p.active=false, 150);
                }
            });
        });

        // Smooth Camera Follow
        camera.targetX = player.x - W*0.3;
        camera.x += (camera.targetX - camera.x) * 0.1;

        if(Math.abs(player.x-stalker.x)<20*scale && Math.abs(player.y-stalker.y)<30*scale) die();
        if(player.y > H) die();

        if(player.x > (currentLevel * 2200) * scale) {
            isPaused = true; document.getElementById('puzzle-screen').classList.remove('hidden'); initPuzzle();
        }
    } else {
        if(stalker.x >= player.x - 5) die();
    }
}

function draw() {
    ctx.clearRect(0,0,W,H);
    // Draw Level Decor (Nodes)
    platforms.forEach(p => {
        if(!p.active) return;
        ctx.fillStyle = "rgba(0, 242, 255, 0.05)"; ctx.strokeStyle = "rgba(0, 242, 255, 0.4)";
        ctx.strokeRect(p.x-camera.x, p.y, p.w, p.h); ctx.fillRect(p.x-camera.x, p.y, p.w, p.h);
        // Platform Edge Glow
        ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(p.x-camera.x, p.y); ctx.lineTo(p.x+p.w-camera.x, p.y); ctx.stroke();
    });
    stalker.draw(camera.x); player.draw(camera.x);
}

function die() { isDead=true; document.getElementById('death-screen').classList.remove('hidden'); }
function reboot() { currentLevel=1; startLevel(1); audio.playLofi(); }
function loop() { update(); draw(); requestAnimationFrame(loop); }

startLevel(1); loop();
