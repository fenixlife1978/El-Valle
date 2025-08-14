'use client';
import { useState, useEffect, useRef } from 'react';
import './payments.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faMoneyBillWave, faBuilding, faUsers, faCalendarCheck, faTools, faBullhorn, faCog, faFileUpload, faTimes, faReceipt, faFlagCheckered, faSearch, faEye, faPrint, faUsers as faUsersSolid, faCalculator, faPlus, faCheckCircle } from '@fortawesome/free-solid-svg-icons';


export default function PaymentsPage() {
    const [activeTab, setActiveTab] = useState('own');
    const [notification, setNotification] = useState({ show: false, message: '' });

    // Own Payment State
    const [ownAmount, setOwnAmount] = useState('');
    const [ownBank, setOwnBank] = useState('');
    const [ownOtherBank, setOwnOtherBank] = useState('');
    const [ownPaymentType, setOwnPaymentType] = useState('');
    const [ownReference, setOwnReference] = useState('');
    const [ownDate, setOwnDate] = useState('');
    const [ownFile, setOwnFile] = useState<File | null>(null);
    const [ownErrors, setOwnErrors] = useState<string[]>([]);
    const ownFileInputRef = useRef<HTMLInputElement>(null);

    // Third Party Payment State
    const [thirdAmount, setThirdAmount] = useState('');
    const [thirdBank, setThirdBank] = useState('');
    const [thirdOtherBank, setThirdOtherBank] = useState('');
    const [thirdPaymentType, setThirdPaymentType] = useState('');
    const [thirdReference, setThirdReference] = useState('');
    const [thirdDate, setThirdDate] = useState('');
    const [thirdFile, setThirdFile] = useState<File | null>(null);
    const [thirdBeneficiaryQuery, setThirdBeneficiaryQuery] = useState('');
    const [thirdBeneficiaryResult, setThirdBeneficiaryResult] = useState<{name: string, unit: string} | null>(null);
    const [thirdBeneficiarySelected, setThirdBeneficiarySelected] = useState(false);
    const [thirdErrors, setThirdErrors] = useState<string[]>([]);
    const thirdFileInputRef = useRef<HTMLInputElement>(null);


    // Global Payment State
    const [globalAmount, setGlobalAmount] = useState('');
    const [globalBank, setGlobalBank] = useState('');
    const [globalOtherBank, setGlobalOtherBank] = useState('');
    const [globalPaymentType, setGlobalPaymentType] = useState('');
    const [globalReference, setGlobalReference] = useState('');
    const [globalDate, setGlobalDate] = useState('');
    const [globalFile, setGlobalFile] = useState<File | null>(null);
    const [globalSplits, setGlobalSplits] = useState([{ beneficiary: '', amount: '' }]);
    const [globalErrors, setGlobalErrors] = useState<string[]>([]);
    const globalFileInputRef = useRef<HTMLInputElement>(null);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFile: (file: File | null) => void) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (!allowedTypes.includes(file.type)) {
                alert('Tipo de archivo no permitido. Por favor seleccione una imagen (JPG, PNG) o PDF.');
                return;
            }

            if (file.size > maxSize) {
                alert('El archivo es demasiado grande. El tamaño máximo es 5MB.');
                return;
            }
            setFile(file);
        }
    };
    
    const showNotification = (message: string) => {
        setNotification({ show: true, message });
        setTimeout(() => {
            setNotification({ show: false, message: '' });
        }, 5000);
    };

    const formatDateString = (dateString: string) => {
        if (!dateString) return 'No especificada';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('es-VE').format(date);
    };

    const handleSearchBeneficiary = () => {
        if (thirdBeneficiaryQuery.trim() !== '') {
            setTimeout(() => {
                const query = thirdBeneficiaryQuery.toLowerCase();
                 if (query.includes('maria') || query.includes('gonzalez')) {
                    setThirdBeneficiaryResult({name: 'María González Pérez', unit: 'Unidad: APTO 205'});
                } else if (query.includes('carlos') || query.includes('rodriguez')) {
                    setThirdBeneficiaryResult({name: 'Carlos Rodríguez Silva', unit: 'Unidad: APTO 408'});
                } else if (query.includes('ana') || query.includes('perez')) {
                    setThirdBeneficiaryResult({name: 'Ana Pérez López', unit: 'Unidad: LOCAL 1'});
                } else {
                    const lastNames = ['Pérez', 'González', 'Rodríguez', 'López', 'Martínez'];
                    const units = ['APTO 101', 'APTO 205', 'APTO 308', 'APTO 402', 'LOCAL 1'];
                    const randomLastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                    const randomUnit = units[Math.floor(Math.random() * units.length)];
                    setThirdBeneficiaryResult({name: `${thirdBeneficiaryQuery} ${randomLastName}`, unit: `Unidad: ${randomUnit}`});
                }
                setThirdBeneficiarySelected(false);
            }, 500);
        }
    };
    
    const handleAddSplit = () => {
        setGlobalSplits([...globalSplits, { beneficiary: '', amount: '' }]);
    };
    
    const handleRemoveSplit = (index: number) => {
        if (globalSplits.length > 1) {
            const newSplits = globalSplits.filter((_, i) => i !== index);
            setGlobalSplits(newSplits);
        }
    };
    
    const handleSplitChange = (index: number, field: 'beneficiary' | 'amount', value: string) => {
        const newSplits = [...globalSplits];
        newSplits[index][field] = value;
        setGlobalSplits(newSplits);
    };

    const validateOwnPayment = () => {
        const errors = [];
        if (!ownAmount || parseFloat(ownAmount) <= 0) errors.push('El monto debe ser mayor que cero');
        if (!ownBank) errors.push('Debe seleccionar el banco de origen');
        if (ownBank === 'other' && !ownOtherBank.trim()) errors.push('Debe especificar el nombre del banco');
        if (!ownPaymentType) errors.push('Debe seleccionar un tipo de pago');
        if (!ownReference.trim() || !/^\d{6}$/.test(ownReference.trim())) errors.push('La referencia debe tener 6 dígitos');
        if (!ownDate) errors.push('La fecha del pago es obligatoria');
        if (new Date(ownDate) > new Date()) errors.push('La fecha no puede ser futura');
        if (!ownFile) errors.push('El comprobante de pago es obligatorio');
        setOwnErrors(errors);
        return errors.length === 0;
    };
    
    const handleOwnSubmit = () => {
        if (validateOwnPayment()) {
            showNotification('Pago propio reportado correctamente. En revisión por el administrador.');
            // Reset form
            setOwnAmount('');
            setOwnBank('');
            setOwnOtherBank('');
            setOwnPaymentType('');
            setOwnReference('');
            setOwnDate('');
            setOwnFile(null);
            if (ownFileInputRef.current) ownFileInputRef.current.value = '';
        }
    };

    // Placeholder for other validations
    const handleThirdSubmit = () => { showNotification('Pago a tercero reportado.'); };
    const handleGlobalSubmit = () => { showNotification('Pago global reportado.'); };
    
    const globalSplitTotal = globalSplits.reduce((acc, split) => acc + (parseFloat(split.amount) || 0), 0);
    const globalBalance = (parseFloat(globalAmount) || 0) - globalSplitTotal;


    return (
        <div>
            <div className="content-header">
                <h2 className="content-title">Sistema de Pagos</h2>
            </div>
            <div className="tabs">
                <div className={`tab ${activeTab === 'own' ? 'active' : ''}`} onClick={() => setActiveTab('own')}>💰 Pago Propio</div>
                <div className={`tab ${activeTab === 'third' ? 'active' : ''}`} onClick={() => setActiveTab('third')}>👥 Pagos a Terceros</div>
                <div className={`tab ${activeTab === 'global' ? 'active' : ''}`} onClick={() => setActiveTab('global')}>📊 Pagos Globales</div>
            </div>

            {activeTab === 'own' && (
                <div className="tab-content active" id="own">
                    <div className="payment-form">
                        <h3>Registro de Pago Propio</h3>
                        <p style={{ marginBottom: '20px', color: '#666' }}>Registre el pago de su cuota de condominio. El comprobante será revisado por el administrador.</p>

                        {ownErrors.length > 0 && (
                            <div className="validation-errors" id="own-errors">
                                <strong>Errores de validación:</strong>
                                <ul id="own-errors-list">
                                    {ownErrors.map((error, i) => <li key={i}>{error}</li>)}
                                </ul>
                            </div>
                        )}
                        
                        <div className="form-row">
                            <div className="form-group required">
                                <label htmlFor="own-amount">Monto (Bs.)</label>
                                <input type="number" id="own-amount" className="form-control" placeholder="0.00" step="0.01" value={ownAmount} onChange={e => setOwnAmount(e.target.value)} />
                            </div>
                            <div className="form-group required">
                                <label htmlFor="own-bank">Banco de Origen</label>
                                <select id="own-bank" className="form-control" value={ownBank} onChange={e => setOwnBank(e.target.value)}>
                                    <option value="">Seleccionar banco</option>
                                    <option value="bdv">Banco de Venezuela (BDV)</option>
                                    <option value="banesco">Banco Banesco (BAN)</option>
                                    <option value="mercantil">Banco Mercantil (MER)</option>
                                    <option value="provincial">Banco Provincial (PRO)</option>
                                    <option value="other"><strong>Otros</strong></option>
                                </select>
                            </div>
                        </div>

                        {ownBank === 'other' && (
                            <div className="other-bank-container" style={{display: 'block'}}>
                                <div className="form-group">
                                    <label htmlFor="own-other-bank-name">Nombre del Banco</label>
                                    <input type="text" id="own-other-bank-name" className="form-control" placeholder="Ingrese el nombre del banco" value={ownOtherBank} onChange={e => setOwnOtherBank(e.target.value)} />
                                </div>
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group required">
                                <label htmlFor="own-payment-type">Tipo de Pago</label>
                                <select id="own-payment-type" className="form-control" value={ownPaymentType} onChange={e => setOwnPaymentType(e.target.value)}>
                                    <option value="">Seleccionar tipo</option>
                                    <option value="transfer">Transferencia</option>
                                    <option value="mobile">Pago Móvil</option>
                                </select>
                            </div>
                            <div className="form-group required">
                                <label htmlFor="own-reference">Referencia Bancaria (últimos 6 dígitos)</label>
                                <input type="text" id="own-reference" className="form-control" placeholder="123456" maxLength={6} value={ownReference} onChange={e => setOwnReference(e.target.value)} />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group required">
                                <label htmlFor="own-date">Fecha del Pago</label>
                                <input type="date" id="own-date" className="form-control" value={ownDate} onChange={e => setOwnDate(e.target.value)} />
                            </div>
                        </div>

                        <div className="form-group required">
                            <label>Comprobante de Pago</label>
                            {!ownFile ? (
                                <div className="file-upload" onClick={() => ownFileInputRef.current?.click()}>
                                    <FontAwesomeIcon icon={faFileUpload} />
                                    <p>Cargar comprobante de pago</p>
                                    <small>Formatos permitidos: JPG, PNG, PDF (máx. 5MB)</small>
                                    <input type="file" ref={ownFileInputRef} onChange={e => handleFileChange(e, setOwnFile)} accept="image/*,application/pdf" style={{ display: 'none' }} />
                                </div>
                            ) : (
                                <div className="uploaded-file" style={{display: 'flex'}}>
                                    <div>
                                        <strong>Comprobante cargado:</strong> <span>{ownFile.name}</span>
                                        <div style={{ marginTop: '3px', fontSize: '0.8rem', color: '#666' }}>Listo para enviar</div>
                                    </div>
                                    <button className="remove-file" onClick={() => setOwnFile(null)}><FontAwesomeIcon icon={faTimes} /></button>
                                </div>
                            )}
                        </div>

                        <div className="summary">
                            <div className="summary-title"><FontAwesomeIcon icon={faReceipt} /> Detalles del Pago</div>
                            <div className="summary-row"><span>Unidad:</span><span>APTO 305</span></div>
                            <div className="summary-row"><span>Banco de Origen:</span><span>{ownBank === 'other' ? `Otro (${ownOtherBank})` : ownBank}</span></div>
                            <div className="summary-row"><span>Monto del Pago:</span><span>Bs. {parseFloat(ownAmount || '0').toFixed(2)}</span></div>
                            <div className="summary-row"><span>Tipo de Pago:</span><span>{ownPaymentType}</span></div>
                            <div className="summary-row"><span>Fecha:</span><span>{formatDateString(ownDate)}</span></div>
                        </div>

                        <button className="btn-success" onClick={handleOwnSubmit}><FontAwesomeIcon icon={faFlagCheckered} /> Reportar Pago</button>
                    </div>

                    <h3>Mis Pagos Registrados</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Banco</th>
                                    <th>Monto</th>
                                    <th>Tipo de Pago</th>
                                    <th>Referencia</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                               <tr>
                                    <td>15/03/2023</td>
                                    <td><span className="bank-option">Banco Mercantil</span></td>
                                    <td>Bs. 450.00</td>
                                    <td>Transferencia</td>
                                    <td>789456</td>
                                    <td><span className="status-badge status-pending">En revisión</span></td>
                                    <td className="actions">
                                        <button className="action-btn"><FontAwesomeIcon icon={faEye} /></button>
                                        <button className="action-btn"><FontAwesomeIcon icon={faPrint} /></button>
                                    </td>
                                </tr>
                                <tr>
                                    <td>15/02/2023</td>
                                    <td><span className="bank-option">Banco de Venezuela</span></td>
                                    <td>Bs. 450.00</td>
                                    <td>Pago Móvil</td>
                                    <td>123789</td>
                                    <td><span className="status-badge status-paid">Aprobado</span></td>
                                    <td className="actions">
                                        <button className="action-btn"><FontAwesomeIcon icon={faEye} /></button>
                                        <button className="action-btn"><FontAwesomeIcon icon={faPrint} /></button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'third' && (
                 <div className="tab-content active" id="third">
                    <div className="payment-form">
                        <h3>Pago en Nombre de Tercero</h3>
                        <p style={{ marginBottom: '20px', color: '#666' }}>Registre un pago que realizó en nombre de otro propietario. El comprobante será revisado por el administrador.</p>
                        
                        <div className="form-group">
                            <label>Buscar Beneficiario</label>
                            <div className="search-container">
                                <input type="text" className="form-control search-input" placeholder="Nombre del propietario..." value={thirdBeneficiaryQuery} onChange={e => setThirdBeneficiaryQuery(e.target.value)} />
                                <button className="search-btn" onClick={handleSearchBeneficiary}><FontAwesomeIcon icon={faSearch} /></button>
                            </div>
                        </div>

                        {thirdBeneficiaryResult && (
                            <div className="beneficiary-result" style={{display: 'block'}}>
                                <div className="beneficiary-info">
                                    <div className="beneficiary-details">
                                        <div className="beneficiary-name">{thirdBeneficiaryResult.name}</div>
                                        <div className="beneficiary-unit">{thirdBeneficiaryResult.unit}</div>
                                    </div>
                                    <div className="beneficiary-actions">
                                        <button className="btn btn-primary" onClick={() => {setThirdBeneficiarySelected(true); showNotification('Beneficiario seleccionado.')}}>Seleccionar</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Form fields identical to own payment */}
                         <button className="btn-success" onClick={handleThirdSubmit}><FontAwesomeIcon icon={faFlagCheckered} /> Reportar Pago</button>
                    </div>
                 </div>
            )}

            {activeTab === 'global' && (
                 <div className="tab-content active" id="global">
                    <div className="payment-form">
                        <h3>Pago Global con Desglose</h3>
                        <p style={{ marginBottom: '20px', color: '#666' }}>Registre un pago que cubre cuotas de varios propietarios.</p>
                        
                        {/* Global payment data form */}

                        <div className="split-payment">
                            <div className="split-header">
                                <div className="split-title"><FontAwesomeIcon icon={faUsersSolid} /> Desglose por Beneficiarios</div>
                            </div>
                            
                            <div id="global-split-container">
                                {globalSplits.map((split, index) => (
                                    <div className="split-item" key={index}>
                                        <select className="form-control beneficiary-select" value={split.beneficiary} onChange={e => handleSplitChange(index, 'beneficiary', e.target.value)}>
                                            <option value="">Seleccionar beneficiario</option>
                                            <option value="1">María González - APTO 205</option>
                                            <option value="2">Carlos Rodríguez - APTO 408</option>
                                            <option value="3">Ana Pérez - LOCAL 1</option>
                                        </select>
                                        <input type="number" className="form-control split-amount" placeholder="Monto (Bs.)" value={split.amount} onChange={e => handleSplitChange(index, 'amount', e.target.value)} />
                                        <button className="remove-split" onClick={() => handleRemoveSplit(index)}><FontAwesomeIcon icon={faTimes} /></button>
                                    </div>
                                ))}
                            </div>
                            
                            <button className="btn btn-secondary" onClick={handleAddSplit} style={{ marginTop: '15px', width: 'auto' }}>
                                <FontAwesomeIcon icon={faPlus} /> Agregar beneficiario
                            </button>
                        </div>

                        <div className="summary">
                            <div className="summary-title"><FontAwesomeIcon icon={faCalculator} /> Resumen del Pago Global</div>
                             <div className="summary-row"><span>Monto Total del Pago:</span><span>Bs. {parseFloat(globalAmount || '0').toFixed(2)}</span></div>
                            <div className="summary-row"><span>Número de Beneficiarios:</span><span>{globalSplits.filter(s => s.beneficiary && s.amount).length}</span></div>
                            <div className="summary-row"><span>Suma de Montos Asignados:</span><span>Bs. {globalSplitTotal.toFixed(2)}</span></div>
                            <div className="summary-row" style={{color: Math.abs(globalBalance) > 0.01 ? 'var(--danger-color)' : 'var(--success-color)'}}>
                                <span>Diferencia:</span><span>Bs. {globalBalance.toFixed(2)}</span>
                            </div>
                        </div>
                        
                         <button className="btn-success" onClick={handleGlobalSubmit}><FontAwesomeIcon icon={faFlagCheckered} /> Reportar Pago Global</button>
                    </div>
                 </div>
            )}
            
            {notification.show && (
                <div className="notification show">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>{notification.message}</span>
                </div>
            )}
        </div>
    );
}
