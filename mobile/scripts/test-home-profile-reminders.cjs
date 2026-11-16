const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,deps={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>id==='react'?React:id==='react/jsx-runtime'?require(id):deps[id]||{},console,Date,Intl,atob,Promise,Map,Set});return m.exports;}
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
const profile=load('src/lib/profile-completion.ts');
const token=(id,extra='')=>'header.'+Buffer.from(JSON.stringify({session_id:id,extra})).toString('base64url')+'.signature';
const session=(id,user='first',extra='')=>({user:{id:user},access_token:token(id,extra)});
function fixture(){let current=session('login-1'),callback,saved=null,holds=false;const reads=[];const storage={getItem:async()=>holds?new Promise(resolve=>reads.push(resolve)):saved,setItem:async(_key,value)=>{saved=value;}};const supabase={auth:{getSession:async()=>({data:{session:current}}),onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}}}}};const hook=load('src/hooks/use-home-banner-dismissal.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},'@/lib/supabase':{supabase}});let value;function Screen(){value=hook.useHomeBannerDismissal();return null;}return {hook,Screen,get:()=>value,saved:()=>saved,change(next,event='SIGNED_IN'){current=next;callback(event,next);},hold(){holds=true;},reads};}
test('completion checks region and private birth date without treating optional contact details as required',()=>{const complete={name:'Example Player',region:'Gauteng',category:'Open',home_club:'Club',racket_brand:'Brand'};assert.deepEqual(Array.from(profile.missingProfileFields(complete,{birthDate:true,playtomic:true})),[]);assert.deepEqual(Array.from(profile.missingProfileFields({...complete,region:null},{birthDate:false,playtomic:true})),['Region','Date of birth']);assert(!profile.missingProfileFields(complete).includes('Date of birth'),'unknown private state is not guessed as missing');});
test('action dismissal survives token refresh and route remount, then resets on a new login',async()=>{const f=fixture();let r;try{await act(async()=>{r=create(React.createElement(f.Screen));await settle();});assert.equal(f.get().hidden,false);await act(async()=>{f.get().dismiss();await settle();});assert.equal(f.get().hidden,true);assert.equal(f.saved(),'first:login-1');assert(!f.saved().includes('signature'));await act(async()=>{f.change(session('login-1','first','new token'),'TOKEN_REFRESHED');await settle();});assert.equal(f.get().hidden,true);await act(async()=>r.unmount());await act(async()=>{r=create(React.createElement(f.Screen));await settle();});assert.equal(f.get().hidden,true);await act(async()=>{f.change(null,'SIGNED_OUT');f.change(session('login-2'));await settle();});assert.equal(f.get().hidden,false);}finally{if(r)await act(async()=>r.unmount());}});
test('a delayed preference from the previous login cannot hide the next account banner',async()=>{const f=fixture();f.hold();let r;try{await act(async()=>{r=create(React.createElement(f.Screen));await settle();});await act(async()=>{f.change(session('login-b','second'));await settle();});await act(async()=>{f.reads[1](null);await settle();});assert.equal(f.get().hidden,false);await act(async()=>{f.reads[0]('first:login-1');await settle();});assert.equal(f.get().hidden,false);}finally{if(r)await act(async()=>r.unmount());}});
test('X only dismisses the action banner; profile reminder independently opens Edit profile',async()=>{const native={Pressable:'Pressable',View:'View',Text:'Text',StyleSheet:{create:x=>x}};const c=load('src/components/home-reminders.tsx',{'react-native':native,'@expo/vector-icons':{Ionicons:'Icon'}});let reviews=0,dismissed=0,edited=0,r;try{await act(async()=>{r=create(React.createElement('Root',null,React.createElement(c.HomeActionBanner,{actions:[{title:'Complete payment',subtitle:'Example event'}],onReview:()=>reviews++,onDismiss:()=>dismissed++}),React.createElement(c.ProfileCompletionBanner,{missing:['Region','Date of birth'],onEdit:()=>edited++})));});r.root.findByProps({accessibilityLabel:'Dismiss action banner until next sign in'}).props.onPress();assert.equal(dismissed,1);assert.equal(reviews,0);const reminder=r.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel?.startsWith('Your profile is incomplete'));reminder.props.onPress();assert.equal(edited,1);assert.equal(r.root.findAllByProps({accessibilityLabel:'Dismiss action banner until next sign in'}).length,1);}finally{if(r)await act(async()=>r.unmount());}});

test('each incomplete-profile Review action dismisses Notifications and opens the profile editor directly', async () => {
  const actions = ['Region', 'Racket brand'].map(title => ({ key: title, kind: 'profile', title: `${title} missing`, detail: 'Complete your profile', path: '/edit-profile' }));
  const group = { key: 'account', title: 'My account', actions, notifications: [], eventId: null };
  const calls = [], native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'RefreshControl', 'Text', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  native.FlatList = ({ data, renderItem, ListHeaderComponent }) => React.createElement('List', null, ListHeaderComponent, ...data.map(item => renderItem({ item })));
  const screen = load('src/app/notifications.tsx', {
    'react-native': native, 'expo-router': { useRouter: () => ({ canDismiss: () => true, dismiss: () => calls.push('dismiss'), push: path => calls.push(path) }) },
    'expo-symbols': { SymbolView: 'Symbol' }, '@/theme/tokens': { lightBrand: {} },
    '@/components/help-inbox-provider': { useHelpInbox: () => ({ unread: 0 }) }, '@/components/home-action': { HomeAction: 'Action' },
    '@/components/native-segmented-control': { NativeSegmentedControl: 'Segment' }, '@/components/error-banner': { ErrorBanner: 'Error' },
    '@/hooks/use-notification-centre': { useNotificationCentre: () => ({ ownerKey: 'owner', actions, notifications: [], events: [] }) },
    '@/lib/notification-centre': { groupNotifications: () => [group] },
  });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(screen.default)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'My account. 2 actions needed. Expand' }).props.onPress());
    const reviews = renderer.root.findAllByProps({ label: 'Review' });
    assert.equal(reviews.length, 2);
    reviews.forEach(button => button.props.onPress());
    assert.deepEqual(calls, ['dismiss', '/edit-profile', 'dismiss', '/edit-profile']);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
