export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Returns an HTML page that checks all component files and reports errors
  const html = `<!DOCTYPE html>
<html><head><title>HGI Debug</title>
<style>body{background:#0A0A0A;color:#E8E0D0;font-family:monospace;padding:20px}
.ok{color:#27AE60}.err{color:#C0392B}.warn{color:#E67E22}pre{background:#111;padding:10px;border-radius:4px;overflow-x:auto}</style>
</head><body>
<h1 style="color:#C9A84C">HGI System Diagnostic</h1>
<div id="out"></div>
<script>
var out=document.getElementById('out');
function log(msg,cls){out.innerHTML+='<div class="'+(cls||'')+'">'+msg+'</div>';}
var files=['shared.js','pipeline.js','FullWorkflow.js','PipelineScanner.js','PipelineTracker.js',
'WinnabilityScoring.js','ResearchAnalysis.js','ProposalEngine.js','ProposalAutoGen.js',
'RecruitingBench.js','WeeklyDigest.js','FinancialPricing.js','Dashboard.js',
'OpportunityDiscovery.js','CRM.js','ContentEngine.js','OpportunityBrief.js',
'KnowledgeBase.js','Chat.js','App.js'];

async function checkFile(f){
  try{
    var r=await fetch('/components/'+f);
    if(!r.ok){log('MISSING: '+f+' ('+r.status+')','err');return;}
    var txt=await r.text();
    log('OK: '+f+' ('+txt.length+' bytes)','ok');
    try{new Function(txt)}catch(e){log('  SYNTAX ERROR: '+e.message,'err');}
  }catch(e){log('FETCH FAIL: '+f+' - '+e.message,'err');}
}

async function checkFunctions(){
  log('--- Checking required global functions ---');
  var fns=['useState','useEffect','GOLD','TEXT','BG','BORDER','RED','GREEN','ORANGE',
    'HGI_CONTEXT','queryKB','store','callClaude','Badge','Card','Btn','Input','Textarea',
    'Label','AIOut','OPIBadge','usePipeline','OpportunitySelector','fetchPipelineData',
    'invalidatePipelineCache','renderMarkdown'];
  fns.forEach(function(fn){
    if(typeof window[fn]!=='undefined')log('  DEFINED: '+fn,'ok');
    else log('  MISSING: '+fn,'err');
  });
}

async function checkAPIs(){
  log('--- Checking API endpoints ---');
  var apis=['/api/opportunities?limit=1','/api/notify','/api/knowledge-query?vertical=disaster'];
  for(var i=0;i<apis.length;i++){
    try{
      var r=await fetch(apis[i]);
      log('  '+apis[i]+': '+(r.ok?'OK '+r.status:'FAIL '+r.status),r.ok?'ok':'err');
    }catch(e){log('  '+apis[i]+': ERROR '+e.message,'err');}
  }
}

async function run(){
  log('=== HGI SYSTEM DIAGNOSTIC ===');
  log('Time: '+new Date().toISOString());
  log('');
  log('--- Checking component files ---');
  for(var i=0;i<files.length;i++)await checkFile(files[i]);
  log('');
  await checkAPIs();
  log('');
  log('--- Loading React + Babel + Components ---');
  // Load React
  var s1=document.createElement('script');s1.src='https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js';
  document.head.appendChild(s1);
  s1.onload=function(){
    log('React loaded','ok');
    var s2=document.createElement('script');s2.src='https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js';
    document.head.appendChild(s2);
    s2.onload=function(){
      log('ReactDOM loaded','ok');
      var s3=document.createElement('script');s3.src='https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js';
      document.head.appendChild(s3);
      s3.onload=function(){
        log('Babel loaded','ok');
        log('');
        // Now try loading shared.js through babel
        log('--- Compiling shared.js with Babel ---');
        fetch('/components/shared.js').then(function(r){return r.text()}).then(function(code){
          try{
            var compiled=Babel.transform(code,{presets:['react']});
            eval(compiled.code);
            log('shared.js compiled and executed OK','ok');
          }catch(e){log('shared.js COMPILE/EXEC ERROR: '+e.message,'err');}
          // Now pipeline.js
          log('--- Compiling pipeline.js with Babel ---');
          fetch('/components/pipeline.js').then(function(r){return r.text()}).then(function(code2){
            try{
              var compiled2=Babel.transform(code2,{presets:['react']});
              eval(compiled2.code);
              log('pipeline.js compiled and executed OK','ok');
            }catch(e){log('pipeline.js COMPILE/EXEC ERROR: '+e.message,'err');}
            log('');
            checkFunctions();
            log('');
            log('=== DIAGNOSTIC COMPLETE ===');
          });
        });
      };
    };
  };
}
run();
</script></body></html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}