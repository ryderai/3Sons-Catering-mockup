/* 3 Sons Bar-B-Q — shared scripts. Built by AI Syndicate. */
(function(){
  var doc=document, body=doc.body;
  body.classList.remove('no-js');
  var dp=doc.getElementById('drawPath'); if(dp&&dp.getTotalLength) dp.style.setProperty('--len',Math.ceil(dp.getTotalLength()));
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- mobile menu: full screen, focus stays inside, page does not scroll behind it
  var mb=doc.querySelector('.menu-btn'), nav=doc.getElementById('nav');
  function navLinks(){return [mb].concat([].slice.call(nav.querySelectorAll('a')));}
  function openNav(){nav.classList.add('open');mb.setAttribute('aria-expanded','true');mb.textContent='Close';doc.documentElement.classList.add('nav-lock');}
  function closeNav(focus){nav.classList.remove('open');mb.setAttribute('aria-expanded','false');mb.textContent='Menu';doc.documentElement.classList.remove('nav-lock');if(focus)mb.focus();}
  if(mb&&nav){
    mb.addEventListener('click',function(){nav.classList.contains('open')?closeNav(false):openNav();});
    nav.addEventListener('click',function(e){if(e.target.closest('a'))closeNav(false);});
    doc.addEventListener('keydown',function(e){
      if(!nav.classList.contains('open')) return;
      if(e.key==='Escape'){closeNav(true);return;}
      if(e.key==='Tab'){
        var f=navLinks(), first=f[0], last=f[f.length-1];
        if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    window.addEventListener('resize',function(){if(innerWidth>900&&nav.classList.contains('open'))closeNav(false);});
  }

  // ---- split headings into words (each word rises out of a mask)
  if(!reduce){
    [].forEach.call(doc.querySelectorAll('[data-split]'),function(h){
      var i=0;
      (function walk(node){
        [].slice.call(node.childNodes).forEach(function(c){
          if(c.nodeType===3){
            var parts=c.textContent.split(/(\s+)/), frag=doc.createDocumentFragment();
            parts.forEach(function(p){
              if(!p) return;
              if(/^\s+$/.test(p)){frag.appendChild(doc.createTextNode(p));return;}
              var w=doc.createElement('span'); w.className='w';
              var wi=doc.createElement('span'); wi.className='wi'; wi.style.setProperty('--i',i++); wi.textContent=p;
              w.appendChild(wi); frag.appendChild(w);
            });
            c.parentNode.replaceChild(frag,c);
          } else if(c.nodeType===1) walk(c);
        });
      })(h);
    });
  }

  // ---- stagger children
  [].forEach.call(doc.querySelectorAll('[data-stagger]'),function(g){
    var step=parseInt(g.getAttribute('data-stagger'),10)||140;
    [].forEach.call(g.children,function(c,i){c.style.setProperty('--d',(i*step)+'ms');});
  });

  // ---- count-ups
  function countUp(el){
    var to=parseFloat(el.getAttribute('data-count')), dec=(el.getAttribute('data-count').split('.')[1]||'').length;
    var t0=null, dur=2200;
    function f(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/dur); var e=1-Math.pow(1-p,4);
      el.textContent=(to*e).toFixed(dec); if(p<1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }

  // ---- reveals
  var rv=doc.querySelectorAll('.rv,.clip,[data-split]');
  if(reduce||!('IntersectionObserver' in window)){
    [].forEach.call(rv,function(el){el.classList.add('in');});
  } else {
    var cio=new IntersectionObserver(function(es){es.forEach(function(e){
      if(e.isIntersecting){(e.target.__clips||[]).forEach(function(c){c.classList.add('in');});cio.unobserve(e.target);}
    })},{threshold:.12});
    var io=new IntersectionObserver(function(es){es.forEach(function(e){
      if(e.isIntersecting){
        e.target.classList.add('in');
        [].forEach.call(e.target.querySelectorAll('[data-count]'),countUp);
        if(e.target.hasAttribute('data-count')) countUp(e.target);
        io.unobserve(e.target);
      }})},{threshold:.18,rootMargin:'0px 0px -6% 0px'});
    [].forEach.call(rv,function(el){
      // clip-path hides the box from IntersectionObserver, so watch the parent instead
      if(el.classList.contains('clip')){
        var par=el.parentElement; par.__clips=(par.__clips||[]).concat(el);
        if(!par.__watched){par.__watched=true;cio.observe(par);}
      } else io.observe(el);
    });
  }

  // ---- scroll progress line, nav state, gentle hero parallax
  var bar=doc.querySelector('.progress span'), hdr=doc.querySelector('.hdr'), hero=doc.querySelector('[data-parallax]');
  var ticking=false;
  function onScroll(){
    var y=window.scrollY||0, h=doc.documentElement.scrollHeight-innerHeight;
    if(bar) bar.style.transform='scaleX('+(h>0?Math.min(1,y/h):0)+')';
    if(hdr) hdr.classList.toggle('scrolled',y>8);
    if(hero&&!reduce&&y<innerHeight*1.2) hero.style.transform='translate3d(0,'+(y*0.22).toFixed(1)+'px,0) scale(1.04)';
    ticking=false;
  }
  window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(onScroll);}},{passive:true});
  onScroll();
})();

(function(){
  // catering planner — prices from 3sonsbarbq.com/catering, read Oct 1 2026
  var P=[{n:10,lbs:'5 lbs.',sides:'1.5 qts.',price:220,corn:20,pud:40},
         {n:20,lbs:'10 lbs.',sides:'2.5 qts.',price:440,corn:40,pud:80},
         {n:30,lbs:'15 lbs.',sides:'3 qts.',price:660,corn:60,pud:120},
         {n:40,lbs:'20 lbs.',sides:'1 gal.',price:880,corn:80,pud:160},
         {n:50,lbs:'25 lbs.',sides:'1.5 gals.',price:1100,corn:100,pud:200}];
  var f=document.getElementById('planner'); if(!f) return;
  var g=document.getElementById('guests'), go=document.getElementById('guestsOut'), d=document.getElementById('date');
  var $=function(id){return document.getElementById(id)};
  var money=function(n){return '$'+Math.round(n).toLocaleString('en-US')};
  var today=new Date(); today.setHours(0,0,0,0);
  var iso=function(dt){return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')};
  if(d){d.min=iso(today);}
  function render(){
    var n=parseInt(g.value,10); go.textContent=n>50?'50+':n;
    var lines=$('lines'), btn=$('orderBtn');
    if(n>50){
      $('pkName').textContent='More than 50 people';
      $('pkSub').textContent='Big crowd. Let’s plan it together.';
      lines.innerHTML='<li><span>Call or email at least 5 days ahead</span><span>Custom</span></li>';
      $('sub').textContent='Let’s talk'; $('grat').textContent='We’ll build the order with you by phone or email. Orders are confirmed once paid.';
      btn.textContent='Call (850) 278-6082'; btn.href='tel:+18502786082'; btn.removeAttribute('target'); btn.removeAttribute('aria-label');
    } else {
      var p=P.filter(function(x){return x.n>=n})[0];
      var bris=f.querySelector('input[name=brisket]:checked').value==='1';
      var add=[].map.call(f.querySelectorAll('input[name=addon]:checked'),function(x){return x.value});
      var rows=[['The '+p.n+'-person package',p.price]];
      if(bris) rows.push(['Brisket upgrade ('+n+' guests × $3, estimate)',n*3]);
      if(add.indexOf('cornbread')>-1) rows.push(['Cornbread',p.corn]);
      if(add.indexOf('pudding')>-1) rows.push(['Banana pudding',p.pud]);
      var gal=Math.max(0,Math.min(30,parseInt(($('tea')||{}).value,10)||0)); if(gal) rows.push(['Iced tea ('+gal+' gal.)',gal*12]);
      var sub=rows.reduce(function(a,r){return a+r[1]},0);
      $('pkName').textContent='The '+p.n+'-person package';
      $('pkSub').textContent=p.lbs+' of meat · '+p.sides+' each of 3 sides'+(n<p.n?' · feeds up to '+p.n:'');
      lines.innerHTML=rows.map(function(r){return '<li><span>'+r[0]+'</span><span>'+money(r[1])+'</span></li>'}).join('');
      $('sub').textContent=money(sub);
      $('grat').textContent='About '+money(sub*1.18)+' with the 18% gratuity added to all catering orders, before tax (an estimate — your total is confirmed when you call). Paying by card adds a 3.5% processing fee. No further discounts apply.';
      btn.textContent='Order catering online'; btn.href='https://3sonsbar-b-q.gethoneycart.com/'; btn.target='_blank'; btn.setAttribute('aria-label','Order catering online (opens in a new tab)');
    }
    // order-by date: 48h bulk, 72h over 30, 5 days over 50 (3sonsbarbq.com/catering)
    var dl=$('deadline');
    if(d && d.value){
      var parts=d.value.split('-'); var meal=new Date(+parts[0],+parts[1]-1,+parts[2]);
      var days=n>50?5:(n>30?3:2);
      var need=days===5?'5 days':(days*24)+' hours';
      var by=new Date(meal); by.setDate(by.getDate()-days-1); // one extra day so a phone order at closing still clears the full notice
      var label=by.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
      var y=meal.getFullYear(), nov1=new Date(y,10,1), tg=new Date(y,10,1+((11-nov1.getDay())%7)+21);
      var closed=(meal.getMonth()===11&&meal.getDate()===25)||(+meal===+tg);
      if(closed){dl.innerHTML='<strong>We’re closed that day</strong> (Thanksgiving and Christmas Day). Pick another day, or call <a href="tel:+18502786082" style="color:#FFE2C7">(850) 278-6082</a>.';}
      else if(by<today){dl.innerHTML='<strong>That’s a tight timeline.</strong> We ask for '+need+' for this size. Call us — we may be able to work with it: <a href="tel:+18502786082" style="color:#FFE2C7">(850) 278-6082</a>.';}
      else dl.innerHTML=(n>50?'Call or email by <strong>':'Call or come in by <strong>')+''+label+'</strong>, before we close at 8p. That gives us the full '+need+' we ask for '+(n>50?'more than 50 people':n>30?'more than 30 people':'a bulk order')+'.';
    } else dl.textContent='Pick a date and we’ll tell you the day to order by.';
  }
  g.addEventListener('input',render); f.addEventListener('input',render);
  f.addEventListener('change',render);
  [].forEach.call(f.querySelectorAll('.step'),function(b){b.addEventListener('click',function(){g.value=Math.min(60,Math.max(10,parseInt(g.value,10)+parseInt(b.dataset.step,10)));render();})});
  render();
})();

/* round 3: dismissible announcement + FAQ accordions */
(function(){
  var doc=document;
  var bar=doc.getElementById('announce');
  if(bar){
    var key='3sons-announce-'+(bar.getAttribute('data-key')||'');
    try{ if(localStorage.getItem(key)==='hidden') bar.classList.add('is-hidden'); }catch(e){}
    var x=bar.querySelector('.announce__x');
    if(x) x.addEventListener('click',function(){
      bar.classList.add('is-hidden');
      try{ localStorage.setItem(key,'hidden'); }catch(e){}
      var m=doc.getElementById('main'); if(m) m.focus();
    });
  }
  var btns=[].slice.call(doc.querySelectorAll('.qa-btn'));
  if(!btns.length) return;
  function set(b,open){ b.setAttribute('aria-expanded',open?'true':'false'); var p=doc.getElementById(b.getAttribute('aria-controls')); if(p) p.hidden=!open; }
  btns.forEach(function(b){ set(b,false); b.addEventListener('click',function(){ set(b,b.getAttribute('aria-expanded')!=='true'); }); });
  var all=doc.querySelector('.qa-all');
  if(all) all.addEventListener('click',function(){
    var open=all.getAttribute('aria-pressed')!=='true';
    btns.forEach(function(b){ set(b,open); });
    all.setAttribute('aria-pressed',open?'true':'false');
    all.textContent=open?'Close all answers':'Open all answers';
  });
  function fromHash(){
    var id=location.hash.slice(1); if(!id) return;
    var sec=doc.getElementById(id); if(!sec) return;
    var b=sec.querySelector('.qa-btn'); if(b){ set(b,true); }
  }
  fromHash(); window.addEventListener('hashchange',fromHash);
})();
