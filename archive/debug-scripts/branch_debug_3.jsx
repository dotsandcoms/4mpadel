                                            <div className="space-y-5">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Full Name</label>
                                                        <div className="relative group">
                                                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green group-focus-within:text-white transition-colors" size={16} />
                                                            <input
                                                                type="text"
                                                                name="full_name"
                                                                value={formData.full_name}
                                                                onChange={handleInputChange}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                placeholder="Player Full Name"
                                                                required
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Email Address</label>
                                                        <div className="relative">
                                                            <Mail className={`absolute left-5 top-1/2 -translate-y-1/2 ${emailCheckStatus === 'not_found' ? 'text-red-500' : 'text-padel-green'}`} size={16} />
                                                            <input
                                                                type="email"
                                                                name="email"
                                                                value={formData.email}
                                                                onChange={handleInputChange}
                                                                className={`w-full bg-white/5 border ${emailCheckStatus === 'not_found' ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-12 pr-10 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600`}
                                                                placeholder="email@example.com"
                                                                required
                                                            />
                                                            {emailCheckStatus === 'checking' && (
                                                                <Loader className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                                                            )}
                                                        </div>
                                                        {emailCheckStatus === 'not_found' && (
                                                            <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest bg-red-500/10 py-1.5 px-3 rounded-lg border border-red-500/20 inline-block mt-1">Profile not found. Please create a profile first.</p>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Phone Number</label>
                                                        <div className="relative">
                                                            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green" size={16} />
                                                            <input
                                                                type="tel"
                                                                name="phone"
                                                                value={formData.phone}
                                                                onChange={handleInputChange}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                placeholder="+27 00 000 0000"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between ml-3 mb-1">
                                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Select Divisions</label>
                                                            {registeredDivisions.length > 0 && (
                                                                <span className="text-[9px] font-black uppercase tracking-widest bg-padel-green/10 text-padel-green px-2 py-0.5 rounded-md border border-padel-green/20">
                                                                    {selectedDivisions.length} / {registeredDivisions.length} Selected
                                                                </span>
                                                            )}
                                                        </div>
                                                        
                                                        {isCheckingReg ? (
                                                            <div className="flex items-center gap-4 bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-4 animate-pulse">
                                                                <Loader className="w-5 h-5 animate-spin text-padel-green" />
                                                                <span className="text-sm text-gray-400 font-bold uppercase tracking-widest">Syncing Rankedin Status...</span>
                                                            </div>
                                                        ) : registeredDivisions.length > 0 ? (
                                                            <div className="grid grid-cols-1 gap-2.5">
                                                                {registeredDivisions.map(divName => {
                                                                    const alreadyPaid = paidDivisions.includes(divName);
                                                                    const isSelected = selectedDivisions.includes(divName);
                                                                    
                                                                    return (
                                                                        <button
                                                                            key={divName}
                                                                            type="button"
                                                                            disabled={alreadyPaid}
                                                                            onClick={() => {
                                                                                setSelectedDivisions(prev => 
                                                                                    prev.includes(divName) 
                                                                                        ? prev.filter(d => d !== divName) 
                                                                                        : [...prev, divName]
                                                                                );
                                                                            }}
                                                                            className={`group relative flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-300 ${
                                                                                alreadyPaid 
                                                                                    ? 'bg-padel-green/5 border-padel-green/20 opacity-60 cursor-not-allowed' 
                                                                                    : isSelected
                                                                                        ? 'bg-padel-green border-padel-green shadow-lg shadow-padel-green/20 scale-[1.02]'
                                                                                        : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-4">
                                                                                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all duration-300 ${
                                                                                    alreadyPaid ? 'bg-padel-green border-padel-green' :
                                                                                    isSelected ? 'bg-white border-white' : 'border-white/20 bg-black/20'
                                                                                }`}>
                                                                                    {alreadyPaid && <CheckCircle size={14} className="text-white" />}
                                                                                    {isSelected && !alreadyPaid && <CheckCircle size={14} className="text-padel-green" />}
                                                                                </div>
                                                                                <div className="text-left">
                                                                                    <span className={`text-[13px] font-black uppercase tracking-tight block ${
                                                                                        isSelected && !alreadyPaid ? 'text-black' : alreadyPaid ? 'text-padel-green' : 'text-white'
                                                                                    }`}>
                                                                                        {divName}
                                                                                    </span>
                                                                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                                                                        isSelected && !alreadyPaid ? 'text-black/60' : 'text-white/30'
                                                                                    }`}>
                                                                                        Tournament Entry
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-col items-end gap-1">
                                                                                {alreadyPaid ? (
                                                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-padel-green/20 text-padel-green px-3 py-1 rounded-full border border-padel-green/30">Already Paid</span>
                                                                                ) : (
                                                                                    <span className={`text-sm font-black ${isSelected ? 'text-black' : 'text-padel-green'}`}>
                                                                                        R{getEntryFeeForCategory(divName)}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : formData.email && (
                                                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
                                                                <Trophy className="w-8 h-8 text-orange-500/40 mx-auto mb-3" />
                                                                <p className="text-xs text-orange-400 font-black uppercase tracking-[0.2em] mb-1">Entry Not Found</p>
                                                                <p className="text-[10px] text-orange-400/60 font-bold uppercase tracking-widest leading-relaxed">
                                                                    Please ensure you are registered on Rankedin <br />for this specific event.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between bg-slate-900/80 p-5 rounded-2xl border border-white/5 shadow-2xl group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-padel-green/10 rounded-xl flex items-center justify-center text-padel-green group-hover:bg-padel-green group-hover:text-black transition-all duration-500">
                                                                <Users size={20} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black text-white uppercase tracking-tight">Register with a Partner?</p>
                                                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Optional Entry Fee Payment</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const newState = !hasPartner;
                                                                setHasPartner(newState);
                                                                if (!newState) {
                                                                    setPartnerProfile(null);
                                                                    setPartnerSearchResults([]);
                                                                    setPayForPartner(false);
                                                                    setFormData(prev => ({ ...prev, partner_name: '' }));
                                                                }
                                                            }}
                                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${hasPartner ? 'bg-padel-green' : 'bg-white/10'}`}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xl ring-0 transition duration-300 ease-in-out ${hasPartner ? 'translate-x-5' : 'translate-x-0'}`}
                                                            />
                                                        </button>
                                                    </div>

                                                    <AnimatePresence>
                                                        {hasPartner && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                className="space-y-3"
                                                            >
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Partner Name</label>
                                                                    <div className="relative group">
                                                                        <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green" size={16} />
                                                                        <input
                                                                            type="text"
                                                                            name="partner_name"
                                                                            value={formData.partner_name}
                                                                            onChange={handleInputChange}
                                                                            autoComplete="off"
                                                                            className={`w-full bg-white/5 border ${partnerLookupError ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-12 pr-20 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600`}
                                                                            placeholder="Type 2+ characters to search..."
                                                                        />
                                                                        {isLookingUpPartner && (
                                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                                                <Loader className="w-4 h-4 animate-spin text-padel-green" />
                                                                            </div>
                                                                        )}
                                                                        {partnerProfile && !isLookingUpPartner && (
                                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-padel-green text-black px-2 py-1 rounded-lg shadow-sm font-black uppercase tracking-widest text-[8px]">
                                                                                <CheckCircle className="w-3 h-3 fill-current" />
                                                                                Found
                                                                            </div>
                                                                        )}

                                                                        {/* Search Results Dropdown */}
                                                                        <AnimatePresence>
                                                                            {partnerSearchResults.length > 0 && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: -5 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: -5 }}
                                                                                    className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-2xl z-[1200] overflow-hidden p-1 max-h-48 overflow-y-auto"
                                                                                >
                                                                                    {partnerSearchResults.map((player) => (
                                                                                        <button
                                                                                            key={player.id}
                                                                                            type="button"
                                                                                            onClick={() => handleSelectPartner(player)}
                                                                                            className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg transition-all text-left group/item"
                                                                                        >
                                                                                            <div className="flex items-center gap-2">
                                                                                                <div className="w-6 h-6 rounded-full bg-padel-green/20 flex items-center justify-center text-padel-green group-hover/item:bg-padel-green group-hover/item:text-black transition-colors">
                                                                                                    <User size={12} />
                                                                                                </div>
                                                                                                <div>
                                                                                                    <p className="text-xs font-bold text-slate-900">{player.name}</p>
                                                                                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{player.category || 'No Category'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <CheckCircle className="w-3 h-3 text-padel-green opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                                                                        </button>
                                                                                    ))}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                    {partnerLookupError && !partnerSearchResults.length && (
                                                                        <p className="text-[9px] text-red-600 font-bold uppercase tracking-widest ml-12 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-block">
                                                                            {partnerLookupError}
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                {partnerProfile && (
                                                                    <>
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: 5 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            className="bg-padel-green/5 border border-padel-green/10 p-4 rounded-[1.5rem] flex items-center justify-between group hover:bg-padel-green/10 transition-colors"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-padel-green shadow-sm">
                                                                                    <CreditCard className="w-5 h-5" />
                                                                                </div>
                                                                                <div>
                                                                                    <h5 className="font-black text-white text-[11px] uppercase tracking-tight">Pay for {partnerProfile.name}?</h5>
                                                                                    <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                                                                        Multi-Division Fee Auto-Calculated
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setPayForPartner(!payForPartner)}
                                                                                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${payForPartner ? 'bg-padel-green' : 'bg-slate-200'}`}
                                                                            >
                                                                                <span
                                                                                    aria-hidden="true"
                                                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${payForPartner ? 'translate-x-5' : 'translate-x-0'}`}
                                                                                />
                                                                            </button>
                                                                        </motion.div>

                                                                        <AnimatePresence>
                                                                            {payForPartner && !partnerProfile.paid_registration && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                                    animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                                                                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                                    className="overflow-hidden"
                                                                                >
                                                                                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner group">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="w-8 h-8 bg-padel-green/10 rounded-lg flex items-center justify-center text-padel-green">
                                                                                                <CreditCard size={16} />
                                                                                            </div>
                                                                                            <div>
                                                                                                <p className="text-xs font-bold text-white uppercase tracking-tight">Partner License</p>
                                                                                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Choose License Type</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex bg-slate-800 rounded-full p-1 border border-white/5">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setPartnerLicenseChoice('temporary')}
                                                                                                className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'temporary' ? 'bg-padel-green text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                                            >
                                                                                                Temp <span className="opacity-70">(R{FEES.TEMPORARY_LICENSE})</span>
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setPartnerLicenseChoice('full')}
                                                                                                className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'full' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                                            >
                                                                                                Full <span className="opacity-70">(R{FEES.FULL_LICENSE})</span>
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    {playerProfileData && !playerProfileData.paid_registration && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner group mt-3"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 bg-padel-green/10 rounded-lg flex items-center justify-center text-padel-green">
                                                                    <CreditCard size={16} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-white uppercase tracking-tight">License Required</p>
                                                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Choose License Type</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex bg-slate-800 rounded-full p-1 border border-white/5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLicenseChoice('temporary')}
                                                                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'temporary' ? 'bg-padel-green text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                >
                                                                    Temp <span className="opacity-70">(R{FEES.TEMPORARY_LICENSE})</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLicenseChoice('full')}
                                                                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'full' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                >
                                                                    Full <span className="opacity-70">(R{FEES.FULL_LICENSE})</span>
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>

                                                <div className="pt-4 border-t border-white/10">
                                                    <div className="bg-slate-900/50 rounded-[2rem] p-6 text-white overflow-hidden relative group border border-white/5 shadow-2xl">
                                                        {/* Decorative Background Glow */}
                                                        <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/5 rounded-full blur-3xl -mr-24 -mt-24 group-hover:bg-padel-green/10 transition-colors duration-1000" />

                                                        <div className="relative z-10 space-y-5">
                                                            {/* Itemized list */}
                                                            <div className="space-y-4">
                                                                <div className="space-y-3">
                                                                    {/* Registrant Section */}
                                                                    <div className="space-y-2.5">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green mb-1">Your Entries</p>
                                                                        {selectedDivisions.map(div => (
                                                                            <div key={`reg-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[9px] font-black text-padel-green uppercase tracking-wider italic">{div}</p>
                                                                                </div>
                                                                                <span className="text-xs font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                            </div>
                                                                        ))}
                                                                        {selectedDivisions.length === 0 && (
                                                                            <div className="flex justify-between items-start gap-4 opacity-30 p-3">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[9px] font-medium text-white/40 uppercase tracking-wider">No Category Selected</p>
                                                                                </div>
                                                                                <span className="text-xs font-black tracking-tight whitespace-nowrap pt-0.5">R0</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {playerProfileData && !playerProfileData.paid_registration && (
                                                                        <div className="flex justify-between items-center bg-padel-green/10 p-3 rounded-xl border border-padel-green/20">
                                                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-padel-green">4M Padel {licenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                            <span className="text-xs font-black text-padel-green">R{licenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                        </div>
                                                                    )}

                                                                    {/* Partner Section - Conditional */}
                                                                    {hasPartner && partnerProfile && (
                                                                        <div className="space-y-2.5 pt-2">
                                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-1">Partner Entries</p>
                                                                            {selectedDivisions.map(div => (
                                                                                <div key={`par-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                                                                                    <div className="space-y-0.5">
                                                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{partnerProfile.name} <span className="opacity-50">(Partner)</span></p>
                                                                                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-wider italic">{div}</p>
                                                                                    </div>
                                                                                    <span className="text-xs font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                                </div>
                                                                            ))}
                                                                            {payForPartner && !partnerProfile.paid_registration && (
                                                                                <div className="flex justify-between items-center bg-blue-400/10 p-3 rounded-xl border border-blue-400/20 mt-1">
                                                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400">Partner {partnerLicenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                                    <span className="text-xs font-black text-blue-400">R{partnerLicenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Bottom Action Area */}
                                                            <div className="pt-6 border-t border-white/10 mt-2">
                                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full">
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-padel-green mb-1">Grand Total</p>
                                                                        <div className="flex items-baseline gap-3">
                                                                            <p className="text-4xl font-black tracking-tighter leading-none text-white">R {calculateTotalAmount()}</p>
                                                                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 whitespace-nowrap">SECURE PAYSTACK</p>
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={handleRegister}
                                                                        disabled={isSubmitting || emailCheckStatus === 'not_found' || selectedDivisions.length === 0}
                                                                        className="h-16 px-10 bg-padel-green text-black rounded-2xl flex items-center justify-center gap-4 hover:bg-white hover:scale-[1.03] active:scale-95 transition-all duration-500 shadow-2xl shadow-padel-green/30 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed font-black uppercase tracking-[0.15em] text-xs flex-1 md:flex-none group"
                                                                    >
                                                                        <CreditCard className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                                                                        <span>Complete Payment</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
